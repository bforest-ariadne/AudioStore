(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.AudioStore = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// const DB = require('./db');

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

