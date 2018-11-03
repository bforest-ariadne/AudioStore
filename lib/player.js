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
