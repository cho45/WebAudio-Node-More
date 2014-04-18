var $ = require('jquery-browserify'); // no warnings
require('jquery-mousewheel')($);

var OscilloscopeNode = function (context, numberOfInputChannels, bufferSize) {
	var buffers = new Array(numberOfInputChannels);
	for (var i = 0; i < numberOfInputChannels; i++) {
		buffers[i] = new Float32Array(bufferSize);
	}

	var iq = context.createScriptProcessor(4096, numberOfInputChannels, 1);
	iq.triggerPosition = 0.5;
	iq.trigger         = OscilloscopeNode.Trigger.Simple({ triggerChannel: 0, threshold : 0.5 });
	iq.state           = "stopped";
	iq.stateCallback   = function () {};

	var bufferIndex = 0;
	iq.onaudioprocess = function (e) {
		if (iq.state == "stopped") return;

		var data = [];
		for (var i = 0; i < numberOfInputChannels; i++) {
			data[i] = e.inputBuffer.getChannelData(i);
		}


		for (var i = 0, len = e.inputBuffer.length; i < len; i++) {
			if (iq.state == "start") {
				for (var j = 0; j < numberOfInputChannels; j++) { // no warnings
					buffers[j][bufferIndex] = data[j][i];
				}
				bufferIndex = (bufferIndex + 1) % bufferSize;

				iq.sampleCount--;
				if (iq.sampleCount <= 0) {
					iq.sampleCount = 0;
					iq.state = "trigger";
					iq.stateCallback();
				}
			} else
			if (iq.state == "trigger") {
				for (var j = 0; j < numberOfInputChannels; j++) { // no warnings
					buffers[j][bufferIndex] = data[j][i];
				}

				if (iq.trigger(buffers, bufferIndex, bufferSize)) {
					console.log('triggered');
					iq.state = "reading";
					iq.stateCallback();
					iq.sampleCount = Math.round(bufferSize * iq.triggerPosition);
				}

				bufferIndex = (bufferIndex + 1) % bufferSize;
			} else
			if (iq.state == "reading") {
				iq.sampleCount--;
				if (iq.sampleCount <= 0) {
					iq.sampleCount = 0;
					iq.state = "stopped";
					iq.stateCallback();

					// console.log('bufferIndex', bufferIndex);
					for (var j = 0; j < numberOfInputChannels; j++) { // no warnings
						iq.results[j].set(buffers[j].subarray(bufferIndex, bufferSize), 0);
						iq.results[j].set(buffers[j].subarray(0, bufferIndex), bufferSize - bufferIndex);
					}
					iq.callback();
				} else {
					for (var j = 0; j < numberOfInputChannels; j++) { // no warnings
						buffers[j][bufferIndex] = data[j][i];
					}
					bufferIndex = (bufferIndex + 1) % bufferSize;
				}
			} else
			if (iq.state == "stopped") {
				// nothing
			}
		}
	};

	iq.start = function (results, callback) {
		iq.results = results;
		iq.state = "start";
		iq.stateCallback();
		iq.sampleCount = Math.round(bufferSize * (1 - iq.triggerPosition));
		iq.callback = callback;
	};

	iq.stop = function () {
		iq.state = "stopped";
		iq.stateCallback();
	};

	iq._gain = context.createGain();
	iq._gain.gain.value = 0;
	iq.connect(iq._gain);
	iq._gain.connect(context.destination);

	return iq;
};
OscilloscopeNode.Trigger = {};
OscilloscopeNode.Trigger.Simple = function (opts) {
	return function (buffers, bufferIndex, bufferSize) {
		return opts.threshold < buffers[opts.triggerChannel][bufferIndex];
	};
};
OscilloscopeNode.Trigger.RaisingEdge = function (opts) {
	return function (buffers, bufferIndex, bufferSize) {
		return buffers[opts.triggerChannel][ (bufferSize+bufferIndex-opts.width) % bufferSize ] < opts.threshold && opts.threshold < buffers[opts.triggerChannel][bufferIndex];
	};
};
OscilloscopeNode.Trigger.FallingEdge = function (opts) {
	return function (buffers, bufferIndex, bufferSize) {
		return opts.threshold < buffers[opts.triggerChannel][ (bufferSize+bufferIndex-opts.width) % bufferSize ] && buffers[opts.triggerChannel][bufferIndex] < opts.threshold;
	};
};
OscilloscopeNode.Trigger.DualEdge = function (opts) {
	var raising = OscilloscopeNode.Trigger.RaisingEdge(opts);
	var falling = OscilloscopeNode.Trigger.FallingEdge(opts);
	return function (buffers) {
		return raising(buffers, bufferIndex, bufferSize) || falling(buffers, bufferIndex, bufferSize);
	};
};

var WebAudioDebugController = function () { this.init.apply(this, arguments) };
WebAudioDebugController.prototype = {
	init : function (context, source, opts) {
		var self = this;
		if (!opts) opts = {};

		self.numberOfInputChannels = opts.numberOfInputChannels || 2;

		self.context = context;
		self.scale = opts.scale || 1;
		self.bufferSize = opts.bufferSize || 64e3;
		self.windowTime = opts.windowTime || 100e-3;
		self.windowSize = context.sampleRate * self.windowTime;
		self.windowPosition = 0;

		self.colors = opts.colors || [
			'#3276b1',
			'#47a447',
			'#ff0000',
			'#00ff00',
			'#0000ff',
			'#000000'
		];

		self.offsets = opts.offsets || [];

		self.results = new Array(self.numberOfInputChannels);
		for (var i = 0; i < self.numberOfInputChannels; i++) {
			self.results[i] = new Float32Array(self.bufferSize);
		}

		self.osc = new OscilloscopeNode(context, self.numberOfInputChannels, self.bufferSize);
		source.connect(self.osc);
		self.osc.triggerPosition = opts.triggerPosition || 0.99;
		self.osc.trigger = opts.trigger || OscilloscopeNode.Trigger.RaisingEdge({ triggerChannel: 0, threshold : 0.5, width: 10 });
		// self.osc.trigger = OscilloscopeNode.Trigger.FallingEdge({ triggerChannel: 0, threshold : 0.5, width: 10 });
		self.osc.stateCallback = function () {
			self.redraw();
		};

		self.buildElement();
		self.bindEvents();

		self.start(!opts.continuous);
	},

	buildElement : function () {
		var self = this;

		var container = $( (function () { /*
			<div style="padding: 10px" id="webaudio-debug-oscilloscope">
				<style scoped>
					#webaudio-debug-oscilloscope {
						border: 1px solid #ccc;
						margin: 0;
						padding: 0;
						display: inline-box;
						width: 1024px;
					}

					#webaudio-debug-oscilloscope * {
						-webkit-box-sizing: border-box;
						-moz-box-sizing: border-box;
						box-sizing: border-box;
						font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
					}

					#webaudio-debug-oscilloscope button {
						color: inherit;
						font: inherit;
						margin: 0;
					}

					#webaudio-debug-oscilloscope .btn {
						display: inline-block;
						margin-bottom: 0;
						font-weight: 400;
						text-align: center;
						vertical-align: middle;
						cursor: pointer;
						background-image: none;
						border: 1px solid transparent;
						white-space: nowrap;
						padding: 6px 12px;
						font-size: 12px;
						line-height: 1.42857143;
						border-radius: 4px;
						-webkit-user-select: none;
						-moz-user-select: none;
						-ms-user-select: none;
						user-select: none;
					}

					#webaudio-debug-oscilloscope .btn-default {
						color: #333;
						background-color: #fff;
						border-color: #ccc;
					}

					#webaudio-debug-oscilloscope .btn-primary {
						color: #fff;
						background-color: #428bca;
						border-color: #357ebd;
					}

					#webaudio-debug-oscilloscope .btn-group {
						position: relative;
						display: inline-block;
						vertical-align: middle;
					}


					#webaudio-debug-oscilloscope .btn[disabled] {
						cursor: not-allowed;
						pointer-events: none;
						opacity: .65;
						filter: alpha(opacity=65);
						-webkit-box-shadow: none;
						box-shadow: none;
					}

					#webaudio-debug-oscilloscope .btn-group>.btn:first-child:not(:last-child):not(.dropdown-toggle) {
						border-bottom-right-radius: 0;
						border-top-right-radius: 0;
					}

					#webaudio-debug-oscilloscope .btn-group>.btn:first-child {
						margin-left: 0;
					}

					#webaudio-debug-oscilloscope .btn-group>.btn, 
					#webaudio-debug-oscilloscope .btn-group-vertical>.btn {
						position: relative;
						float: left;
					}

					#webaudio-debug-oscilloscope .btn-group>.btn:not(:first-child):not(:last-child):not(.dropdown-toggle) {
						border-radius: 0;
					}

					#webaudio-debug-oscilloscope .btn-group .btn+.btn,
					#webaudio-debug-oscilloscope .btn-group .btn+.btn-group,
					#webaudio-debug-oscilloscope .btn-group .btn-group+.btn,
					#webaudio-debug-oscilloscope .btn-group .btn-group+.btn-group {
						margin-left: -1px;
					}

					#webaudio-debug-oscilloscope .btn-group>.btn:last-child:not(:first-child),
					#webaudio-debug-oscilloscope .btn-group>.dropdown-toggle:not(:first-child) {
						border-bottom-left-radius: 0;
						border-top-left-radius: 0;
					}
				</style>
				<div class="btn-group">
					<button id="scaleup" class="btn btn-default">Scale-up</button>
					<button id="scaledown" class="btn btn-default">Scale-down</button>
				</div>
				<div class="btn-group">
					<button id="zoomin" class="btn btn-default">Zoom-in</button>
					<button id="zoomout" class="btn btn-default">Zoom-out</button>
				</div>
				<div class="btn-group">
					<button id="start" class="btn btn-primary">Start</button>
					<button id="oneshot" class="btn btn-primary">One-shot</button>
				</div>
				<div>
					<input type="range" id="window" step="0.1" min="0" max="100" value="0" style="width:1024px"/>
				</div>
				<canvas id="canvas" width="1024" height="200" style="width:1024px;height:200px"></canvas>
			</div>
		*/
		}).toString().replace(/.*\/\*|\*\/.*/g, '') ).prependTo(document.body);

		self.element = {
			container    : container,
			windowSlider : container.find('#window'),
			zoomin       : container.find('#zoomin'),
			zoomout      : container.find('#zoomout'),
			start        : container.find('#start'),
			oneshot      : container.find('#oneshot'),
			scaleup      : container.find('#scaleup'),
			scaledown    : container.find('#scaledown'),
			canvas       : container.find('#canvas')
		};

//		if (devicePixelRatio > 1) {
//			self.element.canvas[0].width  = self.element.canvas[0].width  * 2;
//			self.element.canvas[0].height = self.element.canvas[0].height * 2;
//			self.element.canvas[0].getContext('2d').scale(2, 2);
//		}
	},

	bindEvents : function () {
		var self = this;

		var drag = false, x, y, timer;
		$(window).
			mouseup(function (e) {
				drag = false;
			});
		self.element.canvas.
			mousedown(function (e) {
				drag = true;
				x = e.offsetX;
				y = e.offsetY;
			}).
			mousemove(function (e) {
				if (!drag) return;
				var movedX = x - e.offsetX;
				var movedY = y - e.offsetY;
				var whole  = self.element.canvas.width();
				self.windowPosition += (self.windowSize / self.bufferSize) * (movedX / whole);
				if (self.windowPosition < 0) self.windowPosition = 0;
				if (100 < self.windowPosition) self.windowPosition = 100;
				clearTimeout(timer);
				timer = setTimeout(function () {
					self.element.windowSlider.val(self.windowPosition);
				}, 100);
				self.redraw();
				x = e.offsetX;
				y = e.offsetY;
			}).
			mousewheel(function (e) {
//				if (e.deltaY > 0) {
//					self.element.scaledown.click();
//				} else
//				if (e.deltaY < 0) {
//					self.element.scaleup.click();
//				}
				var whole  = self.element.canvas.width();
				self.windowPosition += (self.windowSize / self.bufferSize) * (e.deltaX / whole);
				if (self.windowPosition < 0) self.windowPosition = 0;
				if (100 < self.windowPosition) self.windowPosition = 100;
				clearTimeout(timer);
				timer = setTimeout(function () {
					self.element.windowSlider.val(self.windowPosition);
				}, 100);
				self.redraw();
				e.preventDefault();
			});


		self.element.windowSlider.change(function () {
			var n = +this.value;
			self.windowPosition = n / 100;
			self.redraw();
		});

		self.element.zoomin.click(function () {
			self.windowTime = self.windowTime / 2;
			self.windowSize = self.context.sampleRate * self.windowTime;
			self.redraw();
		});

		self.element.zoomout.click(function () {
			var windowTime = self.windowTime * 2;
			var windowSize = self.context.sampleRate * windowTime;
			if (windowSize < self.bufferSize) {
				self.windowTime = windowTime;
				self.windowSize = windowSize;
			}
			self.redraw();
		});

		self.element.scaleup.click(function () {
			self.scale = self.scale * 2;
			self.redraw();
		});

		self.element.scaledown.click(function () {
			self.scale = self.scale / 2;
			self.redraw();
		});

		self.element.start.click(function () {
			if (!self.started) {
				self.start();
			} else {
				self.stop();
			}
		});

		self.element.oneshot.click(function () {
			self.start(true);
		});
	},

	start : function (oneshot) {
		var self = this;
		self.started = true;
		self.osc.start(self.results, function () {
			self.redraw();
			if (oneshot) {
				self.stop();
			} else {
				self.start();
			}
		});
		self.element.start.text('Stop');
		self.element.oneshot.attr('disabled', true);
	},

	stop : function () {
		var self = this;
		self.started = false;
		self.osc.stop();
		self.element.start.text('Start');
		self.element.oneshot.attr('disabled', false);
	},

	redraw : function () {
		var self = this;
		cancelAnimationFrame(self.timerid);
		self.timerid = requestAnimationFrame(function () {
			self._redraw();
		});
	},

	_redraw : function () {
		var self = this;

		var start = Math.round(self.bufferSize * self.windowPosition);
		if (start > self.bufferSize - self.windowSize) {
			start = self.bufferSize - self.windowSize;
		}

		var canvas = self.element.canvas[0];
		var ctx = canvas.getContext('2d');

		var max = self.scale;
		var gridX = 10;
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// main wave form
		ctx.save();
		ctx.translate(0, 20);

		var height = 150;
		var width  = canvas.width;
		
		// draw grid
		ctx.beginPath();
		ctx.strokeStyle = "#cccccc";
		ctx.moveTo(0, 0);
		ctx.lineTo(width, 0);
		ctx.moveTo(0, height/2);
		ctx.lineTo(width, height/2);
		ctx.moveTo(0, height);
		ctx.lineTo(width, height);
		for (var i = 0, len = gridX; i < len; i++) {
			ctx.moveTo(width/len*i, -20);
			ctx.lineTo(width/len*i, height+20);
		}
		ctx.stroke();

		// draw trigger mark
		var trigger = width * (self.bufferSize * (1 - self.osc.triggerPosition) - start) / self.windowSize;
		ctx.beginPath();
		ctx.fillStyle = '#990099';
		ctx.moveTo(trigger, -10);
		ctx.lineTo(trigger + 5, -20);
		ctx.lineTo(trigger - 5, -20);
		ctx.fill();

		for (var x = 0, it; (it = self.results[x]); x++) {
			ctx.beginPath();
			ctx.moveTo(0, height/2);
			ctx.strokeStyle = self.colors[x];
			var buffer = it.subarray((self.offsets[x] || 0) + start, (self.offsets[x] || 0) + start + self.windowSize);
			var prevX = 0, prevY = 0;
			for (var i = 0, len = buffer.length; i < len; i++) {
				var n = buffer[i] / max;
				var xx = (width * (i / len));
				var yy = (height - (n * 0.5 * height + height / 2));
				ctx.lineTo( ~~(xx*2) / 2, ~~(yy*2) / 2); // floor by ratio 2
				// ctx.lineTo(xx, yy);
			}
			ctx.stroke();
		}
		ctx.restore();
		// end of main

		ctx.font = "10px Monaco";
		ctx.fillText(" Y-scale:" + self.scale + " X-scale:" + formatN(self.windowTime / gridX) + 'sec ' + self.osc.state, 0, height + 45);

		function formatN (n) {
			var nn = n.toExponential(2).split(/e/);
			var u = Math.floor(+nn[1] / 3);
			return nn[0] * Math.pow(10, +nn[1] - u * 3) + ['p', 'n', 'u', 'm', '', 'k', 'M', 'G', 'T'][u+4];
		}
	}
};

window.WebAudioDebug = {
	OscilloscopeNode : OscilloscopeNode,
	instances : [],
	prove : function (context, source, opts) {
		var instance =  new WebAudioDebugController(context, source, opts);
		window.WebAudioDebug.instances.push(instance);
		return instance;
	}
};



