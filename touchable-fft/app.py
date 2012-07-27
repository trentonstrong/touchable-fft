"""
A minimal web application to support server side sampling of sound files into waveform data.

This is required due to very spotty browser support for sampling waveform data of
HTML5 audio or even Flash audio.
"""
try:
    import json
except ImportError:
    import simplejson as json
from flask import Flask, Response, request, render_template
from flask.views import MethodView
from audioread import audio_open
import struct
from uuid import uuid4 as uuid
app = Flask(__name__)


def render_json(data):
	""" Wraps a JSON encodeable piece of data for HTTP response """
	wrapped = dict(data=data)
	return Response(json.dumps(wrapped), mimetype='application/json')

@app.route('/')
def index():
    return render_template('index.html')

class WaveformAPI(MethodView):
	"""
	Provides an API endpoint for sampling an audio file.  Returns a small, random sample of waveform data.
	Supports pulling from a URL or uploading from the client.

	GET:
	  Ex.  /waveform?url=http://www.example.com/someaudiofile

	  url: URL pointing to an audio file to sample waveform data from.
	  sample_rate: Desired (integer) sample rate.  Default: 44100
	  length: Desired (integer) buffer length.  Default: 2048

	POST:
	  file: Audio file to transcode
	  sample_rate: See above.
	  length: See above.
	  
	Response:

	  Returns a JSON encoded object with an interleaved array representation of the sample.  

	  { 'data': [channel 1, element 1, channel 2, c1_2, c2_2, ... ]
	"""

	def get(self):
		return render_json({})

	def post(self):
		audio_file = request.files['file']
		path = '/tmp/%s.dat' % str(uuid())
		audio_file.save(path)
		audio = audio_open(path)
		buffers = list(audio.read_data())
		middle_samples = buffers[ len(buffers) / 2 ]
		decoded_samples = struct.unpack('2048h', middle_sample)
		return render_json({
			'samples': decoded_samples,
			'size': len(decoded_samples),
			'channels': audio.channels,
			'samplerate': audio.samplerate
		})


waveform_view = WaveformAPI.as_view('wave_api')
app.add_url_rule('/waveform/sample', view_func=waveform_view, methods=('GET',))
app.add_url_rule('/waveform/sample', view_func=waveform_view, methods=('POST',))


if __name__ == '__main__':
    app.run(debug=True)