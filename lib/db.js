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
