const { clamp, log1, convertRange } = require('../util/utils');
const workerTimers = require('worker-timers');

// console.log(workerTimers);

module.exports = class Streamer {

  /**
   * streamer constructor
   *
   * @method constructor
   *
   * @param  {String}     url   – audio asset url
   * @param  {AudioStore} store – AudioStore instance
   * @return {Streamer}
   */

  constructor( url, store, chunkSize = 5 ) {
    this.ac     = store.ac;
    this.store  = store;
    this.chunkSize = chunkSize;
    this.url    = url;
    this.name   = url.split('/').pop().split('.')[ 0 ];
    this.active = this.ac.createGain();
    this.input   = this.ac.createGain();
    this.output   = this.ac.createGain();
    this.index = null;

    // throwaway audio buffer
    this.garbageBuffer = this.ac.createBuffer( 1, 1, 44100 );

    // start time in audioContext time
    this.startTime   = null;
    // position of playhead in stream.
    this.startOffset = null;

    this.stopped = true;
    this.ready   = false;

    this.active.connect( this.input );
    this.input.connect( this.output );
    this.output.connect( this.ac.destination );

    this.playbackRate = 1;
    this.when = null;
    this.chunkDuration = null;
    this.offset = null;
    this.currentTime = 0;
    this.bufferList = [];
    this.playNext = function() {};
    this.nextBufferPlayed = false;
    this.nextWhen = null;
    this.playbackRateLock = false;
    this.nextTimerCurrentId = null;
    this.nextTimer = null;
  }

  /**
   * Preload a chunk so that a subsequent call to `stream()` can
   * begin immediately without hitting thr database
   *
   * @method prime
   *
   * @param  {Number} offset – offset in seconds (defaults to 0 or last time )
   * @return {Promise}       – resolves with `this` on completion
   */

  prime( offset ) {
    if ( typeof offset !== 'number' ) {
      offset = this.startOffset !== null ? this.startOffset : 0;
    }

    if ( !this.ready ) {
      let err = new Error(`asset ${ this.name } not loaded`);
      return Promise.reject( err );
    }

    if ( offset >= this.duration ) {
      let err = new Error(`${ offset } is greater than ${ this.duration }`);
      return Promise.reject( err );
    }
    

    const chunkDuration = Math.min( this.chunkSize, this.duration - offset );
    this.chunkDuration = chunkDuration;

    return this.store.getAudioBuffer( this.name, offset, chunkDuration )
    .then( record => {
      const ab  = record;
      const src = this.ac.createBufferSource();

      src.buffer = record;
      src.playbackRate.value = this.playbackRate;
      this.src = src;
      this.bufferList.push( {
        src: src,
        id: src.__resource_id__,
        offset: offset,
        when: 0,
        chunkDuration: chunkDuration,
        played: false
      } );

      this.primed = { offset, src };

      return this;
    });

  }

  /**
   * Begin playback at the supplied offset (or resume playback)
   *
   * @method stream
   *
   * @param  {Number} offset – offset in seconds (defaults to 0 or last time )
   * @return {Streamer}
   */

  stream( offset ) {
    // console.log('pre stream offset');
    if ( typeof offset !== 'number' ) {
      offset = this.startOffset !== null ? this.startOffset : 0;
    }

    // console.log('stream offset', offset);
    if ( !this.ready ) {
      throw new Error(`asset ${ this.name } not loaded`);
    }

    if ( this.stopped === false ) {
      throw new Error(`stream ${ this.name } is already playing`);
    }

    if ( this.ending ) {
      this.ending.onended = () => {};
      this.ending = null;
    }

    if ( offset >= this.duration ) {
      return this.stop();
    }

    // mobile browsers require the first AudioBuuferSourceNode#start() call
    // to happen in the same call stack as a user interaction.
    //
    // out Promise-based stuff breaks that, so we try to get ourselves onto
    // a good callstack here and play an empty sound if we haven't done
    // so already
    if ( this.garbageBuffer ) {
      let src = this.ac.createBufferSource();
      src.buffer = this.garbageBuffer;
      src.start( 0 );
      delete this.garbageBuffer;
    }

    this.stopped = false;
    this.startOffset = offset;
    if (this.offset === null) this.offset = offset;

    this.nextTimer = null;

    console.info(`streaming ${ this.name } @ ${ offset }s`);

    const primed = this.primed;

    delete this.primed;

    if ( primed && primed.offset === offset ) {
      return this.play( primed.src, ( this.ac.currentTime * this.playbackRate ), offset, this.active );
    }

    this.next( 0, offset, this.active );

    return this;
  }

  play( src, when, offset, output ) {
    const logtime = ( when - ( this.ac.currentTime * this.playbackRate ) ) * 1000;
    const logstr  = `playing chunk ${ this.name } @ ${ offset }s`;

    this.logtimer = setTimeout( () => console.info( logstr ), logtime );

    src.connect( output );
    src.playbackRate.value = this.playbackRate;
    try {
      src.start( when * (1/this.playbackRate) );
    }
    catch(error) {
      this.log(error);
      return;
    }
    
    this.src = src;
    if (this.offset === null) {
      this.offset = offset;
      this.log('offset set in play');
    }
    // console.log('chunkDur', this.chunkDuration, 'currentTime', this.getCurrentTime(), 'offset', this.offset);


    const dur = src.buffer.duration;
    this.chunkDuration = dur;

    // if (when ===  0) when = this.when;

    when += dur;
    offset += dur;
    

    if ( this.startTime === null ) {
      // this.startTime = when;
      this.startTime = ( this.ac.currentTime * this.playbackRate );
    }

    if ( offset >= this.duration ) {
      this.ending = src;
      src.onended = () => this.stop();
      console.info(`end of file ${ this.name }`);
      return;
    }
    this.setPlaybackRate(this.playbackRate);

    const fetchtime = ( when - ( this.ac.currentTime * this.playbackRate ) ) * 1000 - 2000;

    this.fetchtimer = setTimeout(() => {
      console.info(`need chunk ${ this.name } @ ${ offset }s`);
      this.next( when, offset, output );
    }, fetchtime );
  }


  next( when = 0, offset = 0, output ) {
    this.log('next function');
    const _this = this;
    const chunkDuration = Math.min( this.chunkSize, this.duration - offset );
    this.store.getAudioBuffer( this.name, offset, chunkDuration )
    .then( record => {
      if ( this.stopped || output !== this.active ) {
        return;
      }

      const ab  = record;
      const src = this.ac.createBufferSource();
      const dur = ab.duration;
      this.nextBufferPlayed = false;

      src.buffer = ab;

      if ( when === 0 ) {
        when = ( this.ac.currentTime * this.playbackRate );
      }
      
      if ( this.startTime === null ) {
        this.startTime = when;
      }

      if ( this.bufferList.length >= 4 ) {
        delete this.bufferList[ this.bufferList.length -1 ].src
        this.bufferList[ this.bufferList.length -1 ].src = undefined;
        // this.bufferList.splice( 0, this.bufferList.length -2 );
      }

      this.bufferList.push( {
        src: src,
        id: src.__resource_id__,
        offset: offset,
        when: when,
        chunkDuration: chunkDuration,
        played: false
      } );

      this.nextId = src.__resource_id__;
      this.log('next buffer id', this.nextId);

      this.log('predicted when', when);
      this.when = when;
      let playType = 3;
      this.nextWhen = when;

      this.src.onended = function() {
        // this in onended is the audioBufferSourceNode
        const acAdjustedTime = (_this.ac.currentTime * _this.playbackRate);
        _this.log('old buffer ended', _this.getCurrentTime(), 'nextBufferPlayed', _this.nextBufferPlayed, 'nextWhen > current time', _this.nextWhen, (acAdjustedTime + 0.11) );
        // if ( !_this.nextBufferPlayed && ( _this.nextWhen > (_this.ac.currentTime * _this.playbackRate) || _this.nextWhen == null || _this.playbackRate < 0.4 ) ) {
          if ( !_this.nextBufferPlayed && ( _this.nextWhen > ( acAdjustedTime + 0.11) || _this.nextWhen == null || ( Math.abs(acAdjustedTime - _this.nextWhen) ) > 1 ) ) {
          // if ( !_this.nextBufferPlayed ) {
          log1('prevented');
          _this.log('no next play prevented', _this.getCurrentTime());
          _this.playNext();
          _this.offset = offset;
          _this.nextBufferPlayed = true;
          try {
            _this.log('canceled timer id', _this.nextTimerCurrentId)
            workerTimers.clearInterval(_this.nextTimerCurrentId);
            _this.nextTimerCurrentId = null;
          }
          catch (error) {
            _this.log(error);
          }
          if (typeof _this.nextOffsetTimer !== 'undefined')clearTimeout(_this.nextOffsetTimer);
          _this.setBufferListPlayed(_this.nextId, true);
          _this.stopBufferListAllBut(_this.nextId);
          _this.playbackRateLock = false; 
          _this.nextWhen = null;
        }
      }

      this.playNext = function() {
        _this.log('playNext', src, this);
        this.play( src, 0, offset, output );
      }

      if (playType == 0) {

        // onended is not sample accurate :(
          _this.log('onend play')
        this.src.onended = function(event) {
          _this.play( src, 0, offset, output );
        }
      } else if (playType == 1) {
        
      } else if (playType == 2) {
        this.play( src, when, offset, output );
      } else if (playType == 3) {

        this.nextTimerFunc = function() {
          _this.log('next log timer start. id', _this.nextId );
          _this.playbackRateLock = true;
          let timerWhen = (_this.getCountdown() * 1) + ( _this.ac.currentTime * _this.playbackRate );
          const timeTillPlay = timerWhen - (_this.ac.currentTime * _this.playbackRate);

          const nextSrc = src;
          _this.log('timerwhen', timerWhen);  
          if (timeTillPlay <= 0 || timerWhen < (_this.ac.currentTime * _this.playbackRate)) timerWhen = (_this.ac.currentTime * _this.playbackRate);

          _this.nextWhen = timerWhen;

          _this.log('countdown at play',_this.getCountdown() );
          _this.log('new when',timerWhen, 'time till play', timeTillPlay, 'time', _this.getCurrentTime(), (_this.ac.currentTime * _this.playbackRate), 'next buf played', _this.nextBufferPlayed );

          if (!_this.nextBufferPlayed || timeTillPlay > 1) _this.play( src, timerWhen, offset, output );
     
          _this.nextOffsetTimer = setInterval(function() {
            if( timerWhen <= (_this.ac.currentTime * _this.playbackRate) ) {
              if ( _this.nextBufferPlayed ) return;
              _this.offset = offset;
              _this.log('set offset on actual play', _this.getCurrentTime(), 'next buffer played', _this.nextBufferPlayed );
              _this.nextBufferPlayed = true;
              _this.setBufferListPlayed(_this.nextId, true);
              _this.stopBufferListAllBut(_this.nextId);
              _this.playbackRateLock = false;
              clearInterval(_this.nextOffsetTimer);
              _this.nextWhen = null;
            }
          },1)
        }

        // if (typeof this.nextTimer !== 'undefined') workerTimers.clearInterval(this.nextTimer);
        // if (typeof this.nextOffsetTimer !== 'undefined')clearTimeout(this.nextOffsetTimer);
        const nextTimerInterval = 10;
        this.nextTimerFinished = false;
        this.nextTimerCurrentId = null;

        this.nextTimer = workerTimers.setInterval(function(){

          const countdownSeconds = (_this.getCountdown() * (1/_this.playbackRate) );
          const countdownMSeconds = countdownSeconds * 1000
          if (countdownMSeconds <= nextTimerInterval + 10 ) {
            _this.log('countdown > 25', _this.getCountdown(), countdownMSeconds);
            _this.nextTimerFinished = true;
            _this.nextTimerCurrentId = _this.nextTimer;
            _this.nextTimerFunc();
            if (typeof _this.nextTimer !== 'undefined') workerTimers.clearInterval(_this.nextTimer);
            _this.nextTimer = null;
            
          } else {
            _this.nextTimerCurrentId = _this.nextTimer;
            _this.log('not yet', _this.nextTimer);
          }
        }, nextTimerInterval )
      }
      
      // this.play( src, when, offset, output );
    })
    .catch( err => console.error( err ) );
  }

  /**
   * stop all playback
   *
   * @method stop
   *
   * @return {Streamer}
   */

  stop() {
    if ( this.stopped || !this.ready ) {
      return;
    }

    this.stopped = true;
    this.active.disconnect();
    this.active = this.ac.createGain();
    this.active.connect( this.input );

    const elapsed = ( this.ac.currentTime * this.playbackRate ) - this.startTime;
    // this.log('elapsed', elapsed, this.startTime, this.startOffset);

    this.startTime = null;
    this.startOffset += elapsed;
    this.offset = null;

    console.info(`stopping ${ this.name } @ ${ this.startOffset }s`);

    if ( this.startOffset >= this.duration ) {
      this.startOffset = 0;
    }

    clearTimeout( this.fetchtimer );
    clearTimeout( this.logtimer );
    this.log('nextTimer', this.nextTimer);
    if (typeof this.nextTimer === 'number' && (  !this.nextTimerFinished || this.nextTimerCurrentId ) ) workerTimers.clearInterval( this.nextTimer );
    if (typeof this.nextOffsetTimer !== 'undefined')clearTimeout( this.nextOffsetTimer );
    this.cleanupBufferList();

    return this;
  }

  /**
   * run animation loop tasks
   *
   * @method tick
   *
   * 
   */
  tick() {
    
  }
  getCountdown() {
    return clamp( this.chunkDuration - ( this.getCurrentTime() - this.offset), 0, this.chunkDuration );
  }

  getBufferProgress() {
    return this.getCountdown() * 1 / (this.chunkDuration * this.playbackRate); 
  }


  /**
   * return the current cursor position in seconds
   *
   * @method currentTime
   *
   * @return {Number}    – current playback position in seconds
   */

  getCurrentTime() {
    if ( this.stopped ) {
      return this.startOffset;
    }

    const start   = this.startTime || ( this.ac.currentTime * this.playbackRate );
    const offset  = this.startOffset || 0;
    const elapsed = ( this.ac.currentTime * this.playbackRate ) - start;
    return offset + elapsed;
  }

  /**
   * set the current cursor position in seconds
   *
   * @method seek
   * @param  {Number}   offset – offset in seconds
   * @return {Streamer}
   */

  seek( offset ) {
    if ( !this.stopped ) {
      this.stop();
      this.offset = null;
      this.stream( offset );
    } else {
      this.startOffset = offset;
    }
  }

  getBufferListById(id) {
    for (let i in this.bufferList) {
      if (this.bufferList[i].id === id) return this.bufferList[i];
    }
  }

  setBufferListPlayed(id, played) {
    for (let i = 0; i < this.bufferList.length; i++) {
      if (this.bufferList[i].id === id) this.bufferList[i].played = played;
    }
  }

  stopBufferList(id) {
    for (let i in this.bufferList) {
      if (this.bufferList[i].id === id) this.bufferList[i].src.stop();
    }
  }

  stopBufferListAllBut(id) {
    for (let i in this.bufferList) {
      if (this.bufferList[i].id !== id && !this.bufferList[i].played) this.bufferList[i].src.stop(); 
    }
  }

  cleanupBufferList() {
    for (let i in this.bufferList) {
      // delete this.bufferList[i].src;
      this.bufferList[i].src = undefined;
      this.bufferList[i].src = {};
      this.bufferList.splice(i);
    }
    this.bufferList = undefined;
    this.bufferList = [];
  }
  playBufferList(id, when, offset, output) {
    for (let i in this.bufferList) {
      if (this.bufferList[i].id == id) {
        this.play(this.bufferList[i].src, when, offset, output) 
        
      }
    }
  }
  setIndex( index ) {
    this.index = index;
  }

  setPlaybackRate( rate ) {
    if (this.playbackRateLock) return;
    // this.log('setPlaybackRate', this.store.playbackRate);


    if ( !this.stopped ) {
      const elapsed = ( this.ac.currentTime * this.playbackRate ) - this.startTime;

      this.startTime = null;
      this.startOffset += elapsed;
    }

    this.playbackRate = this.store.playbackRate;
    if ( typeof this.src !== 'undefined' ) this.src.playbackRate.value = this.playbackRate;
    for (let i in this.bufferList) {
      if ( typeof this.bufferList[i].src !== 'undefined' ) this.bufferList[i].src.playbackRate.value = this.playbackRate;
    }

    // if "next()"
    if ( this.startTime === null && !this.stopped ) {
      this.startTime = ( this.ac.currentTime * this.playbackRate );
      this.startTimeAc = this.ac.currentTime;
    }
    
  }

  /**
   * load the audio asset at `this.url`
   *
   * @method load
   *
   * @return {Promise} – resolves with `true`
   */

  load() {
    console.info(`fetching ${ this.url }`);
    return new Promise( ( resolve, reject ) => {
      const xhr = new XMLHttpRequest();

      xhr.open( 'GET', this.url, true );
      xhr.responseType = 'arraybuffer';

      xhr.onload = () => {
        this.ac.decodeAudioData( xhr.response, ab => {
          this.store.saveAudioBuffer( this.name, ab ).then( metadata => {
            this.duration = metadata.duration;
            console.info(`fetched ${ this.url }`);
            this.ready = true;
            resolve( true );
          }, reject );
        }, reject );
      };

      xhr.onerror = reject;

      xhr.send();
    });
  }

  log() {
    if (global.dev && this.index == 0) {
      const css = 'background: #0000ff; color: #5500ff';
      const text = " ";
      let cssArray = ["%c ".concat(text), css];
      var args = Array.prototype.slice.call(arguments);
      let final = cssArray.concat(args);
     console.log.apply(this, final);
    }
  }

}
