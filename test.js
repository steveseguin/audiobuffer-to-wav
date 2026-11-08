var assert = require('assert')
var toWav = require('./')

var passed = 0
var failed = 0

function test (name, run) {
  try {
    run()
    passed++
  } catch (err) {
    failed++
    console.error(name + ': ' + err.message)
  }
}

function makeBuffer (numChannels, frames, sampleRate) {
  var channels = []
  for (var channel = 0; channel < numChannels; channel++) {
    var data = new Float32Array(frames)
    for (var sample = 0; sample < frames; sample++) {
      data[sample] = (channel + 1) / (numChannels + 1) * (sample % 2 ? -1 : 1)
    }
    channels.push(data)
  }
  return {
    numberOfChannels: numChannels,
    length: frames,
    sampleRate: sampleRate,
    getChannelData: function (channel) { return channels[channel] }
  }
}

function expectedPCM (value) {
  value = Math.max(-1, Math.min(1, value))
  return (value < 0 ? value * 0x8000 : value * 0x7FFF) | 0
}

;[1, 2, 3, 4, 6, 8, 32].forEach(function (channels) {
  ;[1, 5, 128].forEach(function (frames) {
    ;[false, true].forEach(function (float32) {
      test(channels + ' channels, ' + frames + ' frames, float32=' + float32, function () {
        var audio = makeBuffer(channels, frames, 48000)
        var wav = toWav(audio, { float32: float32 })
        var view = new DataView(wav)
        var bytes = float32 ? 4 : 2
        assert.strictEqual(wav.byteLength, 44 + frames * channels * bytes)
        assert.strictEqual(Buffer.from(wav).toString('ascii', 0, 4), 'RIFF')
        assert.strictEqual(view.getUint32(4, true), wav.byteLength - 8)
        assert.strictEqual(Buffer.from(wav).toString('ascii', 8, 12), 'WAVE')
        assert.strictEqual(Buffer.from(wav).toString('ascii', 12, 16), 'fmt ')
        assert.strictEqual(view.getUint32(16, true), 16)
        assert.strictEqual(view.getUint16(20, true), float32 ? 3 : 1)
        assert.strictEqual(view.getUint16(22, true), channels)
        assert.strictEqual(view.getUint32(24, true), audio.sampleRate)
        assert.strictEqual(view.getUint32(28, true), audio.sampleRate * channels * bytes)
        assert.strictEqual(view.getUint16(32, true), channels * bytes)
        assert.strictEqual(view.getUint16(34, true), bytes * 8)
        assert.strictEqual(Buffer.from(wav).toString('ascii', 36, 40), 'data')
        assert.strictEqual(view.getUint32(40, true), frames * channels * bytes)
        for (var sample = 0; sample < frames; sample++) {
          for (var channel = 0; channel < channels; channel++) {
            var offset = 44 + (sample * channels + channel) * bytes
            var value = audio.getChannelData(channel)[sample]
            var actual = float32 ? view.getFloat32(offset, true) : view.getInt16(offset, true)
            assert.strictEqual(actual, float32 ? value : expectedPCM(value))
          }
        }
      })
    })
  })
})

test('default options encode 16-bit PCM and clip samples', function () {
  var data = new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2])
  var audio = {
    numberOfChannels: 1,
    sampleRate: 44100,
    getChannelData: function () { return data }
  }
  var wav = toWav(audio)
  var view = new DataView(wav)
  assert.strictEqual(view.getUint16(20, true), 1)
  for (var i = 0; i < data.length; i++) {
    assert.strictEqual(view.getInt16(44 + i * 2, true), expectedPCM(data[i]))
  }
  assert.deepStrictEqual(Buffer.from(toWav(audio, null)), Buffer.from(wav))
})

test('float output preserves samples outside the PCM range', function () {
  var audio = {
    numberOfChannels: 3,
    sampleRate: 44100,
    getChannelData: function (channel) { return new Float32Array([channel - 2, channel + 1]) }
  }
  var view = new DataView(toWav(audio, { float32: true }))
  var expected = [-2, -1, 0, 1, 2, 3]
  assert.strictEqual(view.byteLength, 44 + expected.length * 4)
  expected.forEach(function (value, i) {
    assert.strictEqual(view.getFloat32(44 + i * 4, true), value)
  })
})

console.log(passed + ' tests passed; ' + failed + ' failed')
process.exitCode = failed ? 1 : 0
