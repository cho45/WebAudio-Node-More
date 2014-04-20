WebAudio Debug Oscilloscope
===========================

<img src="https://dl.dropboxusercontent.com/u/673746/Screenshots/2014-04-20%2021.02.23.png" width="1058" height="297"/>

## USAGE

Include a file:
```
<script src="path_to_https://raw.githubusercontent.com/cho45/WebAudio-Node-More/master/webaudio-debug-oscilloscope/build/webaudio-debug-oscilloscope.js"/>
```


Use `WebAudioDebug` object:
```
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

merger = context.createChannelMerger(2);
gain1.connect(merger, 0, 0);
gain2.connect(merger, 0, 1);

WebAudioDebug.prove(context, merger, {
	// continuous : true
});
```


## DEVELOPMENT

```
$ npm install --save-dev
$ grunt
```

Edit `webaudio-debug-oscilloscope.js` and build compiled file to `build/` automatically.

