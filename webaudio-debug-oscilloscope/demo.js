navigator.getMedia = (
	navigator.getUserMedia ||
	navigator.webkitGetUserMedia ||
	navigator.mozGetUserMedia ||
	navigator.msGetUserMedia
);

window.AudioContext = (
	window.AudioContext ||
	window.webkitAudioContext ||
	window.mozAudioContext ||
	window.msAudioContext
);


var QuadratureMixer = function (context) {
	var iq = context.createScriptProcessor(1024, 1, 2);

	iq.frequency = 1000;
	iq.phase = 0;

	iq.onaudioprocess = function (e) {
		var delta = 2 * Math.PI * iq.frequency / iq.context.sampleRate;

		var data    = e.inputBuffer.getChannelData(0);
		var outputI = e.outputBuffer.getChannelData(0);
		var outputQ = e.outputBuffer.getChannelData(1);
		for (var i = 0, len = e.inputBuffer.length; i < len; i++) {
			iq.phase += delta;
			if (iq.phase > Math.PI * 2) iq.phase -= Math.PI * 2;
			outputI[i] = (Math.cos(iq.phase) / Math.PI) * data[i];
			outputQ[i] = (Math.sin(iq.phase) / Math.PI) * data[i];
		}
	};

	return iq;
};

var AutoGainControl = function (context, numberOfInputChannels) {
	var iq = context.createScriptProcessor(4096, numberOfInputChannels, numberOfInputChannels);

	iq.threshold = 0.9;
	iq.k1 = 1 - 0.0005;
	iq.k2 = 1 + 0.0001;

	var gains = [];
	for (var i = 0; i < numberOfInputChannels; i++) {
		gains[i] = 1;
	}

	iq.onaudioprocess = function (e) {
		for (var n = 0; n < numberOfInputChannels; n++) {
			var gain = gains[n];
			var input = e.inputBuffer.getChannelData(n);
			var output = e.outputBuffer.getChannelData(n);
			for (var i = 0, len = e.inputBuffer.length; i < len; i++) {
				output[i] = input[i] * gain;

				if (Math.abs(output[i]) > iq.threshold) {
					gain = gain * iq.k1;
					if (gain < 1e-2) gain = 1e-2;
				} else {
					gain = gain * iq.k2;
					if (1e2 < gain) gain = 1e2;
				}
			}
			gains[n] = gain;
		}
	};

	return iq;
};

var context = new AudioContext();

source1 = context.createOscillator();
source1.type = 1;
source1.frequency.value = 100;
source1.start(0);
gain1 = context.createGain();
source1.connect(gain1);

source2 = context.createOscillator();
source2.type = 0;
source2.frequency.value = 100;
source2.start(0);
gain2 = context.createGain();
source2.connect(gain2);

agc = new AutoGainControl(context, 1);
gain2.connect(agc);

merger = context.createChannelMerger(2);
// gain1.connect(merger, 0, 0);
agc.connect(merger, 0, 0);

WebAudioDebug.prove(context, merger, {
	bufferSize : 64e3,
	windowTime : 100e-3,
	highResolution : false,
	trigger : WebAudioDebug.OscilloscopeNode.Trigger.RaisingEdge({ triggerChannel: 0, width : 10, threshold : 0.5 }),
	continuous : false
});
// WebAudioDebug.prove(context, merger);

