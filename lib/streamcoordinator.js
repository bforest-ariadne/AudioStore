(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.StreamCoordinator = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// const Streamer = require('./streamer');

module.exports = class StreamCoordinator {

  /**
   * StreamCoordinator constructor
   *
   * Basically, this sort of *looks* like Streamer in terms of the API,
   * but it actually synchronizes *multiple* streamer instances
   *
   * @method constructor
   *
   * @param  {Array}      urls  – array of audio asset url
   * @param  {AudioStore} store – AudioStore instance
   * @return {StreamCoordinator}
   */

  constructor( urls, store, chunkSize = 5 ) {
    this.ac     = store.ac;
    this.store  = store;
    this.urls   = urls;
    this.chunkSize = chunkSize;

    this.output   = this.ac.createGain();
    this.input   = this.ac.createGain();

    this.input.connect( this.output );
    this.output.connect( this.ac.destination );


    this.streamers = this.urls.map( url => new Streamer( url, store, chunkSize ) );

    // throwaway audio buffer
    this.garbageBuffer = this.ac.createBuffer( 1, 1, 44100 );

    this.startTime   = null;
    this.startOffset = null;

    this.stopped = true;
    this.ready   = false;
    this.playbackRate = 1;
    this.elapsed = null;
    this.startTimeAc = null;
    
    for (let i in this.streamers) {
      this.streamers[i].setIndex(i);
      this.streamers[i].output.disconnect( this.ac.destination );
      this.streamers[i].output.connect( this.input );
    }


  }

  /**
   * Begin playback at the supplied offset (or resume playback)
   *
   * @method stream
   *
   * @param  {Number}        offset – offset in seconds (defaults to 0 or last time )
   * @return {StreamCoordinator}
   */

  stream( offset ) {    
    if ( typeof offset !== 'number' ) {
      offset = this.startOffset !== null ? this.startOffset : 0;
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

    const promises = this.streamers.map( streamer => streamer.prime( offset ) );

    Promise.all( promises ).then( () => {
      console.log('audio primed');
      if ( this.startTime === null ) {
        this.startTime = ( this.ac.currentTime * this.store.playbackRate );
        this.startTimeAc = this.ac.currentTime;
      }

      this.streamers.forEach( streamer => streamer.stream( offset ) );
    });
    this.stopped = false;
    this.startOffset = offset;
    // this.setPlaybackRate(this.playbackRate);
    
    return this;
  }

  /**
   * stop all playback
   *
   * @method stop
   *
   * @return {StreamCoordinator}
   */

  stop() {
    if ( this.stopped ) {
      return;
    }
    console.log('coordinator stop');
    // debugger;

    this.streamers.forEach( streamer => streamer.stop() );

    this.stopped = true;

    const elapsed = ( this.ac.currentTime * this.store.playbackRate ) - this.startTime;
    // console.log('elapsed', elapsed, this.startTime, this.startOffset);


    this.startTime = null;
    this.startOffset += elapsed;

    if ( this.startOffset >= this.duration ) {
      this.startOffset = 0;
    }
  }

  setPlaybackRate(rate) {
    // this.stop();
    if (this.streamers[0].playbackRateLock) return;
    if ( !this.stopped ) {
      const elapsed = ( this.ac.currentTime * this.store.playbackRate ) - this.startTime;

      this.startTime = null;
      this.startOffset += elapsed;


    }

    this.store.playbackRate = rate;
    this.playbackRate = this.store.playbackRate;
    this.streamers.forEach( streamer => streamer.setPlaybackRate(rate) );
    
    // this.stream();

    if ( this.startTime === null && !this.stopped ) {
      this.startTime = ( this.ac.currentTime * this.store.playbackRate );
      this.startTimeAc = this.ac.currentTime;
    }
  }

  tick() {
    this.streamers.forEach( streamer => streamer.tick() );
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

    const start   = this.startTime || ( this.ac.currentTime * this.store.playbackRate );
    const offset  = this.startOffset || 0;
    const elapsed = ( this.ac.currentTime * this.store.playbackRate ) - start;
    this.elapsed = elapsed;

    const current = offset + elapsed;

    if ( current >= this.duration ) {
      this.stop();
      return 0;
    }

    return current;
  }

  /**
   * set the current cursor position in seconds
   *
   * @method seek
   * @param  {Number}        offset – offset in seconds
   * @return {StreamCoordinator}
   */

  seek( offset ) {
    if ( !this.stopped ) {
      this.stop();
      this.stream( offset );
    } else {
      this.startOffset = offset;
    }
  }

  /**
   * load all audio assets in `this.urls`
   *
   * @method load
   *
   * @return {Promise} – resolves with `true`
   */

  load() {
    const promises = this.streamers.map( streamer => streamer.load() );
    return Promise.all( promises )
    .then( () => {
      const durations = this.streamers.map( streamer => streamer.duration );
      this.duration = Math.max.apply( Math, durations );
    });
  }

  /**
   * solo the streamer at the given index (same as the order of `this.urls`)
   *
   * @method solo
   *
   * @param  {Number}        index – streamer index
   * @return {StreamCoordinator}
   */

  solo( index ) {
    this.streamers.forEach( streamer => streamer.output.gain.value = 0 );
    this.streamers[ index ].output.gain.value = 1;
  }

  setGain( index, value ) {
    this.streamers[ index ].output.gain.value = value;
  }
  setAllGain( value ) {
    this.streamers.forEach( streamer => streamer.output.gain.value = value )
  }
  setGainDB( index, decibels ) {
    this.setGain( index, Math.pow(10, (decibels / 20)) )
  }
  setAllGainDB( decibels ) {
    // this.streamers.forEach( streamer => streamer.gain.gain.value = Math.pow(10, (decibels / 20)) );
    this.setAllGain( Math.pow(10, (decibels / 20)) )
  }
}


},{}]},{},[1])(1)
});
