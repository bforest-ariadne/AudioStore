(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.audioStore = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (global){
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.AudioStore = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
const DB = typeof global === 'undefined' ? window.DB : require('./db');

const GET_METADATA            = Symbol('getMetadata');
const GET_CHUNK               = Symbol('getChunk');
const PARSE_CHUNK             = Symbol('parseChunk');
const SAVE_METADATA           = Symbol('saveMetadata');
const SAVE_CHUNKS             = Symbol('saveChunks');
const AUDIOBUFFER_TO_METADATA = Symbol('audioBufferToMetadata');
const AUDIOBUFFER_TO_RECORDS  = Symbol('audioBufferToRecords');
const MERGE_CHUNKS            = Symbol('mergeChunks');
const FLOAT32ARRAY_TO_STRING  = Symbol('float32ArrayToString');
const STRING_TO_FLOAT32ARRAY  = Symbol('stringToFloat32Array');

module.exports = class AudioStore {

  /**
   * AudioStore constructor
   *
   * @method constructor
   *
   * @param  {AudioContext} ac        – an AudioContext instance
   * @param  {Object}       [opts={}] – optional options object
   * @return {AudioStore}
   */

  constructor( ac, opts = {} ) {
    this.db       = new DB();
    this.duration = 10;
    this.ac       = ac;
    this.playbackRate = 1;

    // mobile Safari throws up when saving blobs to indexeddb :(
    this.blobs = !/iP(ad|hone|pd)/.test( navigator.userAgent );

    Object.assign( this, opts );
  }

  /**
   * Initialize the database
   *
   * @method init
   *
   * @return {Promise} – Promise that resolves with an AudioStore
   */

  init() {
    return this.db.init().then( () => this );
  }

  /**
   * get metadata for the given track name
   *
   * @method getMetadata
   *
   * @param  {String} name – track name
   * @return {Object}      – metadata record
   */

  [ GET_METADATA ]( name ) {
    return this.db.getRecord( 'metadata', name );
  }

  /**
   * get a chunk from the given file name and the given offset
   *
   * @method getChunk
   *
   * @param  {String}  name    – file name
   * @param  {String}  seconds – chunk offset in seconds
   * @return {Promise}         – resolves with a chunk record
   */

  [ GET_CHUNK ]( name, seconds ) {
    if ( seconds % this.duration !== 0 ) {
      const msg = '${ seconds } is not divisible by ${ this.duration }';
      return Promise.reject( new Error( msg ) );
    }

    const id = `${ name }-${ seconds }`;

    return this.db.getRecord( 'chunks', id )
    .then( chunk => this[ PARSE_CHUNK ]( chunk ) );
  }

  /**
   * read a chunk and replace blobs with Float32Arrays
   *
   * @method parseChunk
   *
   * @param  {Object} chunk – chunk record
   * @return {Object}       – transformed chunk record
   */

  [ PARSE_CHUNK ]( chunk ) {
    return new Promise( ( resolve, reject ) => {
      if ( !this.blobs ) {
        chunk.channels = chunk.channels.map( channel => {
          return this[ STRING_TO_FLOAT32ARRAY ]( channel );
        });
        resolve( chunk );
      } else {
        const channels = [];

        let count = 0;

        for ( let i = 0; i < chunk.channels.length; ++i ) {
          const reader = new FileReader();

          reader.onload = function() {
            channels[ i ] = new Float32Array( this.result );

            if ( ++count === chunk.channels.length ) {
              chunk.channels = channels;
              resolve( chunk );
            }
          };

          reader.onerror = reject;

          reader.readAsArrayBuffer( chunk.channels[ i ] );
        }

      }
    });
  }

  /**
   * save a metadata object
   *
   * @method saveMetadata
   *
   * @param  {Object}  record – track metadata
   * @return {Promise}        – resolves with `true`
   */

  [ SAVE_METADATA ]( record ) {
    return this.db.saveRecords( 'metadata', [ record ] );
  }

  /**
   * save an array of chunk data
   *
   * @method saveMetadata
   *
   * @param  {object}  chunks – chunk data
   * @return {Promise}        – resolves with `true`
   */

  [ SAVE_CHUNKS ]( records ) {
    return this.db.saveRecords( 'chunks', records );
  }

  /**
   * convert an AudioBuffer to a metadata object
   *
   * @method audioBufferToMetadata
   *
   * @param  {String}       name – track name
   * @param  {AudioBuffer}  ab   – AudioBuffer instance
   * @return {Object}            – metadata object
   */

  [ AUDIOBUFFER_TO_METADATA ]( name, ab ) {
    const channels = ab.numberOfChannels;
    const rate     = ab.sampleRate;
    const duration = ab.duration;
    const chunks   = Math.ceil( duration / this.duration );
    return { name, channels, rate, duration, chunks };
  }

  /**
   * convert an AudioBuffer to an array of chunk objects
   *
   * @method audioBufferToRecords
   *
   * @param  {String}       name – track name
   * @param  {AudioBuffer}  ab   – AudioBuffer instance
   * @return {Array}             – array of chunk objects
   */

  [ AUDIOBUFFER_TO_RECORDS ]( name, ab ) {
    const channels    = ab.numberOfChannels;
    const rate        = ab.sampleRate;
    const chunk       = rate * this.duration;
    const samples     = ab.duration * rate;
    const chunks      = Math.ceil( samples / chunk );
    const records     = [];
    const channelData = [];

    for ( let i = 0; i < channels; ++i ) {
      channelData.push( ab.getChannelData( i ) );
    }

    for ( let offset = 0; offset < samples; offset += chunk ) {
      const length  = Math.min( chunk, samples - offset );
      const seconds = offset / ab.sampleRate;
      const id      = `${ name }-${ seconds }`;
      const record  = { id, name, rate, seconds, length };

      record.channels = channelData.map( data => {
        // 4 bytes per 32-bit float...
        const byteOffset = offset * 4;
        const buffer     = new Float32Array( data.buffer, byteOffset, length );

        if ( !this.blobs ) {
          return this[ FLOAT32ARRAY_TO_STRING ]( buffer );
        } else {
          return new Blob([ buffer ]);
        }
      });

      records.push( record );
    }

    return records;
  }

  /**
   * merge an array of chunk records into an audiobuffer
   *
   * @method mergeChunks
   *
   * @param  {Array}       chunks   – array of chunk records
   * @param  {Object}      metadata – metadata record
   * @param  {Number}      start    – start offset in samples
   * @param  {Number}      end      – end offset in samples
   * @return {AudioBuffer}
   */

  [ MERGE_CHUNKS ]( chunks, metadata, start, end ) {
    const merged  = [];
    const length  = chunks.reduce( ( a, b ) => a + b.length, 0 );
    const samples = end - start;
    const rate    = metadata.rate;

    for ( let i = 0; i < metadata.channels; ++i ) {
      merged[ i ] = new Float32Array( length );
    }

    for ( let i = 0, index = 0; i < chunks.length; ++i ) {
      merged.forEach( ( channel, j ) => {
        merged[ j ].set( chunks[ i ].channels[ j ], index );
      });
      index += chunks[ i ].length;
    }

    const channels = merged.map( f32 => f32.subarray( start, end ) );
    const ab       = this.ac.createBuffer( channels.length, samples, rate );

    channels.forEach( ( f32, i ) => ab.getChannelData( i ).set( f32 ) );

    return ab;
  }

  /**
   * convert a Float32Array to a utf-16 String
   *
   * @method float32ArrayToString
   *
   * @param  {Float32Array} f32 – audio data
   * @return {String}           – encoded audio data
   */

  [ FLOAT32ARRAY_TO_STRING ]( f32 ) {
    const { byteOffset, byteLength } = f32;

    const i16 = new Uint16Array( f32.buffer, byteOffset, byteLength / 2 );

    // this is WAY faster when we can use it
    if ( 'TextDecoder' in window ) {
      const decoder = new TextDecoder('utf-16');
      return decoder.decode( i16 );
    }

    let str = '';

    // reduce string concatenations by getting values for a bunch of
    // character codes at once. can't do 'em all in one shot though,
    // because we'll blow out the call stack.
    for ( let i = 0, len = i16.byteLength; i < len; i += 10000 ) {
      const length = Math.min( i + 10000, len - i );
      str += String.fromCharCode.apply( null, i16.subarray( i, length ) );
    }

    return str;
  }

  /**
   * convert a utf-16 string to a Float32Array
   *
   * @method stringToFloat32Array
   *
   * @param  {String}       str – encoded audio data
   * @return {Float32Array}     – decoded audio data
   */

  [ STRING_TO_FLOAT32ARRAY ]( str ) {
    const i16 = new Uint16Array( str.length );

    for ( let i = 0, len = i16.length; i < len; ++i ) {
      i16[ i ] = str.charCodeAt( i );
    }

    const f32 = new Float32Array( i16.buffer );

    return f32;
  }


  /**
   * save an AudioBuffer to the database in chunks
   *
   * @method saveAudioBuffer
   *
   * @param  {String}      name – track name
   * @param  {AudioBuffer} ab   – AudioBuffer instance
   * @return {Promise}          – resolves with `true`
   */

  saveAudioBuffer( name, ab ) {
    console.info(`saving audiobuffer ${ name }`);
    const chunks   = this[ AUDIOBUFFER_TO_RECORDS ]( name, ab );
    const metadata = this[ AUDIOBUFFER_TO_METADATA ]( name, ab );

    return this[ SAVE_CHUNKS ]( chunks )
    .then( () => this[ SAVE_METADATA ]( metadata ) )
    .then( () => {
      console.info(`saved audiobuffer ${ name }`);
      return metadata;
    });
  }

  /**
   * get an AudioBuffer for the given track name
   *
   * this method will automatically stitch together multiple chunks
   * if necessary, we well as perform any trimming needed for
   * `offset` and `duration`.
   *
   * @method getAudioBuffer
   *
   * @param  {String}       name          – track name
   * @param  {Number}       [offset=0]    – offset in seconds
   * @param  {Number}       [duration=10] – duration in seconds
   * @return {Promise}                    – resolves with an AudioBuffer
   */

  getAudioBuffer( name, offset = 0, duration = 10 ) {
    const start = offset;
    const end   = offset + duration;
    const log   = `getting audiobuffer ${ name } @ ${ start }s-${ end }s`;

    console.info( log );

    return this[ GET_METADATA ]( name )
    .then( metadata => {
      if ( offset + duration > metadata.duration ) {
        const msg = '${ end } is beyond track duration ${ metadata.duration }';
        throw new Error( msg );
      }

      const rate     = metadata.rate;
      const channels = metadata.channels;
      const seconds  = Math.floor( offset / this.duration ) * this.duration;
      const samples  = Math.ceil( duration * rate );
      const promises = [];

      offset -= seconds;

      const first = Math.floor( offset * rate );
      const last  = first + samples;

      let sec = seconds;

      while ( sec - offset < seconds + duration ) {
        promises.push( this[ GET_CHUNK ]( name, sec ) );
        sec += this.duration;
      }

      return Promise.all( promises )
      .then( chunks => {
        const ab  = this[ MERGE_CHUNKS ]( chunks, metadata, first, last );
        const msg = `got audiobuffer ${ name } @ ${ start }s-${ end }s`;

        console.info( msg );

        return ab;
      });
    });
  }

}

},{}]},{},[1])(1)
});


}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./db":2}],2:[function(require,module,exports){
(function (global){
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.DB = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

const CREATE_STORES = Symbol('createStores');

module.exports = class DB {

  /**
   * DB constructor
   *
   * @method constructor
   *
   * @return {DB}
   */

  constructor() {
    this.name    = 'AudioStore';
    this.version = 1;
  }

  /**
   * initialize the database
   *
   * @method init
   *
   * @return {Promise} – resolves with a DB instance
   */

  init() {
    return new Promise( ( resolve, reject ) => {
      const req = window.indexedDB.open( this.name, this.version );

      let exists = true;

      req.onsuccess = ev => {
        if ( exists ) {
          console.info(`database ${ this.name } v${ this.version} exists`);
          this.db = ev.target.result
          resolve( this );
        }
      };

      req.onupgradeneeded = ev => {
        this.db = ev.target.result;

        if ( this.db.version === this.version ) {
          exists = false;
          this[ CREATE_STORES ]( this.db ).then( () => {
            console.info(`database ${ this.name } v${ this.version} created`);
            resolve( this );
          });
        }
      };

      req.onerror = reject;
    });
  }

  /**
   * create database stores
   *
   * @method createStores
   *
   * @param  {IndexedDB} db – IndexedDB instance
   * @return {Promise}      – resolves with IndexedDB instance
   */

  [ CREATE_STORES ]( db ) {
    return new Promise( ( resolve, reject ) => {
      const chunks = db.createObjectStore( 'chunks', { keyPath: 'id' } );
      const meta   = db.createObjectStore( 'metadata', { keyPath: 'name' } );

      chunks.createIndex( 'id', 'id', { unique: true } );
      meta.createIndex( 'name', 'name', { unique: true } );

      function done() {
        console.log('done');
        if ( ++count === 2 ) {
          resolve( db );
        }
      }

      // these share a common transaction, so no need to bind both
      chunks.transaction.oncomplete = () => resolve( db );
      chunks.transaction.onerror = reject;
    });
  }

  /**
   * get a record from the database
   *
   * @method getRecord
   *
   * @param  {String}  storename – the objectStore name
   * @param  {String}  id        – the record's id
   * @return {Promise}            – resolves with a record
   */

  getRecord( storename, id ) {
    return new Promise( ( resolve, reject ) => {
      const transaction = this.db.transaction( storename, 'readwrite' );
      const store       = transaction.objectStore( storename );
      const request     = store.get( id );

      request.onsuccess = ev => resolve( request.result );
      request.onerror = reject;
    });
  }

  /**
   * save an array of records to the database
   *
   * @method saveRecords
   *
   * @param  {String}   storename – the objectStore name
   * @param  {array}    records   – array of records to upsert
   * @return {Promise}            – resolves with `true`
   */

  saveRecords( storename, records ) {
    return new Promise( ( resolve, reject ) => {
      const transaction = this.db.transaction( storename, 'readwrite' );
      const store       = transaction.objectStore( storename );

      records.forEach( record => store.put( record ) );

      transaction.oncomplete = () => resolve( true );
      transaction.onerror = reject;
    });
  }

}

},{}]},{},[1])(1)
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],3:[function(require,module,exports){
(function (global){
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Player = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
  module.exports = class Player {

  /**
   * Player constructor
   *
   * @method constructor
   *
   * @param  {HTMLElement} el       – target element
   * @param  {Streamer}    streamer – Streamer instance
   * @return {Player}
   */

  constructor( el, streamer ) {
    this.el       = el;
    this.streamer = streamer;
    this.button   = el.querySelector('.button');
    this.track    = el.querySelector('.track');
    this.progress = el.querySelector('.progress');
    this.scrubber = el.querySelector('.scrubber');
    this.message  = el.querySelector('.message');
    this.time1  = document.querySelector('.time1');
    this.time2  = document.querySelector('.time2');
    this.time3  = document.querySelector('.time3');
    this.time4  = document.querySelector('.time4');
    this.time5  = document.querySelector('.time5');
    this.time6  = document.querySelector('.time6');
    this.time7  = document.querySelector('.time7');
    this.time8  = document.querySelector('.time8');
    this.time9  = document.querySelector('.time9');
    this.slider = document.getElementById("myRange");
    this.output = document.getElementById("demo");
    this.speed1 = document.querySelector('#speed1');
    this.speed2 = document.querySelector('#speed2');
    this.speed3 = document.querySelector('#speed3');
    this.speed4 = document.querySelector('#speed4');
    this.debug = false;

    var _this = this;
    this.slider.oninput = function() {
      _this.streamer.setPlaybackRate(this.value/100);
      _this.output.innerHTML = _this.streamer.playbackRate;
    }

    this.bindEvents();
    this.draw();
  }

  changeSpeedButton() {
    // console.log('changespeed', this.speed1.checked);
    if ( this.speed1.checked ) {
      this.streamer.setPlaybackRate(1);
    } else if( this.speed2.checked) {
      this.streamer.setPlaybackRate(0.8);
    } else if( this.speed3.checked) {
      this.streamer.setPlaybackRate(0.7);
    } else if( this.speed4.checked) {
      this.streamer.setPlaybackRate(0.5);
    }
    
  }

  /**
   * bind event handlers
   *
   * @method bindEvents
   *
   * @return {Undefined}
   */

  bindEvents() {
    this.button.addEventListener( 'click', e => this.toggle( e ) );
    this.scrubber.addEventListener( 'mousedown', e => this.onMouseDown( e ) );
    this.scrubber.addEventListener( 'touchstart', e => this.onTouchStart( e ) );
    this.track.addEventListener( 'click', e => this.onClick( e ) );
    window.addEventListener( 'mousemove', e => this.onDrag( e ) );
    window.addEventListener( 'touchmove', e => this.onToucMove( e ) );
    window.addEventListener( 'mouseup', e => this.onMouseUp( e ) );
    window.addEventListener( 'touchend', e => this.onTouchEnd( e ) );
    this.speed1.addEventListener( 'change', e => this.changeSpeedButton( e ) );
    this.speed2.addEventListener( 'change', e => this.changeSpeedButton( e ) );
    this.speed3.addEventListener( 'change', e => this.changeSpeedButton( e ) );
    this.speed4.addEventListener( 'change', e => this.changeSpeedButton( e ) );
  }

  /**
   * begin playback at offset
   *
   * @method play
   *
   * @param  {Number} position – offset in seconds
   * @return {Player}
   */

  play( position ) {
    this.pause();
    this.streamer.stream( position );
    this.playing = true;
    return this;
  }

  /**
   * pause playback
   *
   * @method pause
   *
   * @return {Player}
   */

  pause() {
    this.streamer.stop();
    this.playing = false;
    return this;
  }

  /**
   * set playback offset
   *
   * @method seek
   *
   * @param  {Number} position – offset in seconds
   * @return {Player}
   */

  seek( position ) {
    position = Math.min( position, this.streamer.duration - 0.5 );
    this.streamer.seek( position );
    return this;
  }

  /**
   * get the current playback offset
   *
   * @method seek
   *
   * @param  {Number}
   * @return {Number} – offset in seconds
   */

  updatePosition() {
    this.position = this.streamer.getCurrentTime();
    if ( this.streamer.stopped ) {
      this.pause();
    }
    return this.position;
  }

  /**
   * toggle between play and pause
   *
   * @method toggle
   *
   * @return {Player}
   */

  toggle() {
    if ( !this.playing ) {
      this.play();
    }
    else {
      this.pause();
    }
    return this;
  }

  /**
   * handle mousedown events for dragging
   *
   * @method onMouseDown
   *
   * @param  {Event}    e – mousedown events
   * @return {Undefined}
   */

  onMouseDown( e ) {
    this.dragging = true;
    this.startX = e.pageX;
    this.startLeft = parseInt( this.scrubber.style.left || 0, 10 );
  }
  onTouchStart( e ) {
    var touches = e.changedTouches;

    for (var i = 0; i < touches.length; i++) {
      console.log("touchstart:" + i + "...");
      
      this.dragging = true;
      this.startX = touches[0].pageX
      this.startLeft = parseInt( this.scrubber.style.left || 0, 10 );
    }


  }

  /**
   * handle mousemove events for dragging
   *
   * @method onDrag
   *
   * @param  {Event}    e – mousemove events
   * @return {Undefined}
   */

  onDrag( e ) {
    if ( !this.dragging ) {
      return;
    }
    const width    = this.track.offsetWidth;
    const position = this.startLeft + ( e.pageX - this.startX );
    const left     = Math.max( Math.min( width, position ), 0 );

    this.scrubber.style.left = left + 'px';
  }

  onToucMove( e ) {
    if ( !this.dragging ) {
      return;
    }
    var touches = e.changedTouches;

    const width    = this.track.offsetWidth;
    const position = this.startLeft + ( touches[0].pageX - this.startX );
    const left     = Math.max( Math.min( width, position ), 0 );

    this.scrubber.style.left = left + 'px';
  }

  /**
   * handle mouseup events for dragging
   *
   * @method onMouseUp
   *
   * @param  {Event}    e – mouseup events
   * @return {Undefined}
   */

  onMouseUp( e ) {
    let isClick = false;
    let target  = e.target;

    while ( target ) {
      isClick = isClick || target === this.track;
      target = target.parentElement;
    }

    if ( this.dragging && !isClick ) {
      const width = this.track.offsetWidth;
      const left  = parseInt( this.scrubber.style.left || 0, 10 );
      const pct   = Math.min( left / width, 1 );
      const time  = this.streamer.duration * pct;
      this.seek( time );
      this.dragging = false;
      return false;
    }
  }

  onTouchEnd( e ) {
    let isClick = false;
    let target  = e.target;

    var touches = e.changedTouches;


    while ( target ) {
      isClick = isClick || target === this.track;
      target = target.parentElement;
    }

    if ( this.dragging && !isClick ) {
      const width = this.track.offsetWidth;
      const left  = parseInt( this.scrubber.style.left || 0, 10 );
      const pct   = Math.min( left / width, 1 );
      const time  = this.streamer.duration * pct;
      this.seek( time );
      this.dragging = false;
      return false;
    }
  }

  /**
   * handle click events for seeking
   *
   * @method onClick
   *
   * @param  {Event}    e – click events
   * @return {Undefined}
   */

  onClick( e ) {
    const width    = this.track.offsetWidth;
    const offset   = this.track.offsetLeft;
    const left     = e.pageX - offset;
    const pct      = Math.min( left / width, 1 );
    const time     = this.streamer.duration * pct;

    this.seek( time );

    this.scrubber.style.left = left + 'px';

    this.dragging = false;
    this.moved = false;
  }

  /**
   * update scrubber and progress bar positions
   *
   * @method draw
   *
   * @return {Player}
   */

  draw() {
    const progress = ( this.updatePosition() / this.streamer.duration );
    const width    = this.track.offsetWidth;

    if ( this.playing ) {
      this.button.classList.add('fa-pause');
      this.button.classList.remove('fa-play');
    } else {
      this.button.classList.add('fa-play');
      this.button.classList.remove('fa-pause');
    }

    this.progress.style.width = ( progress * width ) + 'px';

    if ( !this.dragging ) {
      this.scrubber.style.left = ( progress * width ) + 'px';
    }

    // this.streamer.tick();
    if (this.debug) {
      this.time1.innerHTML = "streamer - currentTime: " + this.streamer.getCurrentTime();
      this.time5.innerHTML = "streamer0 - currentTime: " + this.streamer.streamers[0].getCurrentTime();
      this.time4.innerHTML = "streamers0 getCountdown: " + (this.streamer.streamers[0].getCountdown());
      this.time6.innerHTML = "streamers0 offset: " + (this.streamer.streamers[0].offset);
      this.time2.innerHTML = "ac time * playbackRate:" + ( this.streamer.ac.currentTime * this.streamer.playbackRate );
      this.time3.innerHTML = "ac time:" + this.streamer.ac.currentTime;
      // this.time4.innerHTML = "streamer countdown: " + (this.streamer.streamers[0].countdown);
    }



    
    requestAnimationFrame( () => this.draw() );
  }

}

},{}]},{},[1])(1)
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],4:[function(require,module,exports){
(function (global){
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.StreamCoordinator = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
const Streamer = typeof global === 'undefined' ? window.Streamer : require('./streamer');

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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./streamer":5}],5:[function(require,module,exports){
(function (global){
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Streamer = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
  (function (global){
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
              clearInterval(_this.nextTimerCurrentId);
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
  
          // if (typeof this.nextTimer !== 'undefined') clearInterval(this.nextTimer);
          // if (typeof this.nextOffsetTimer !== 'undefined')clearTimeout(this.nextOffsetTimer);
          const nextTimerInterval = 10;
          this.nextTimerFinished = false;
          this.nextTimerCurrentId = null;
  
          this.nextTimer = setInterval(function(){
  
            const countdownSeconds = (_this.getCountdown() * (1/_this.playbackRate) );
            const countdownMSeconds = countdownSeconds * 1000
            if (countdownMSeconds <= nextTimerInterval + 10 ) {
              _this.log('countdown > 25', _this.getCountdown(), countdownMSeconds);
              _this.nextTimerFinished = true;
              _this.nextTimerCurrentId = _this.nextTimer;
              _this.nextTimerFunc();
              if (typeof _this.nextTimer !== 'undefined') clearInterval(_this.nextTimer);
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
      if (typeof this.nextTimer === 'number' && (  !this.nextTimerFinished || this.nextTimerCurrentId ) ) clearInterval( this.nextTimer );
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
  function clamp(num, min, max) {
    return Math.max(min, Math.min(num, max));
  }
  function convertRange( value, r1, r2 ) { 
    return ( value - r1[ 0 ] ) * ( r2[ 1 ] - r2[ 0 ] ) / ( r1[ 1 ] - r1[ 0 ] ) + r2[ 0 ];
  }
  // convertRange( 328.17, [ 300.77, 559.22 ], [ 1, 10 ] );
  
  // >>> 1.9541497388276272
  function log1(text, arg1) {
    var css = 'background: #ff0000; color: #fff';
    text += " ";
   console.log("%c ".concat(text), css, arg1);
  }
  }).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
  },{}]},{},[1])(1)
  });
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],6:[function(require,module,exports){
module.exports = AudioStore = require('./lib/audiostore');
module.exports = StreamCoordinator = require('./lib/streamcoordinator');
module.exports =  Player = require('./lib/player');


// module.exports = {
//   AudioStore,
//   StreamCoordinator,
//   Player
// }

},{"./lib/audiostore":1,"./lib/player":3,"./lib/streamcoordinator":4}]},{},[6])(6)
});
