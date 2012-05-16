
/*
 * Computes a simple Gaussian normal
 *
 * @param {Float} x Dependent variable input
 *
 * @returns {Float} The Gaussian amplitude at point x
 * TODO:  Parameterize amplitude and spread
 */
Math.gaussian = function(x) {
    return 4.0 * Math.exp( -1.0 * Math.pow(x , 2) / 1024.0 );
};

/*
 *
 * Creates a function that computes a simplistic noise function based on the implementation RNG
 *
 * Note that the function returned memoizes its values for a given input x, thus making it safe
 * and idempotent (approximately pure) for the same input value while maintaining laziness.
 *
 * @param {Float} amplitude The desired (approximate!) RMS amplitude of the noise function
 *
 * @returns {Function} A parameterized noise function
 */
Math.noise = function (amplitude) {
    var memo = {};
    return function (x) {
        if (x in memo) {
            return memo[x];
        } else {

            return memo[x] = amplitude * Math.random() * (Math.random() > 0.5 ? -1 : 1);
        }
    };
};

/*
 * The null function
 *
 * @returns {Float} Always returns 0.0
 */
Math.zeroFunction = function () { return 0.0; };

/*
 * Logarithm in base 10
 *
 * @param {Float} x Input value
 *
 * @returns {Float} The base 10 logarithm of x
 */
Math.log10 = function (x) { return Math.log(x) / Math.log(10); };

/*
 * Converts a value on a linear scale to a logarithmic Decibel scale
 *
 * @param {Float} x Linear value to convert
 *
 * @returns {Float} The standard decibel representation of the value
 */
Math.toDecibels = function (x) { return 20.0 * Math.log10(x); };

/*
 * Primary namespace
 */
var TFFT = window.TFFT = TFFT || {};

/*
 * The buffer size determines the number of storage elements allocated for a discrete signal.
 * Larger buffer sizes allow for the representation of signals with either higher resolution
 * (higher sample rate) or longer length, given that one of the two is fixed.
 *
 * For example, given the default 2048 element buffer and a sample rate of 44100 Hz,
 * the maximum length (in the time domain) of a signal is
 *
 *       1
 *  ----------- * 2048 = .046... seconds
 *    44100 Hz
 *
 * By doubling the buffer size, we could either store a signal that was twice as long
 * at 44.1 KHz or store the same length signal at 88.2 Khz
 *
 */
TFFT.BUFFER_SIZE = 2048;

/*
 * The sample rate specifies the rate at which "samples" -- discrete measurements of
 * a time domain signal taken at even intervals -- are taken.  The default value of
 * 44.1 KHz specifies that each element in the signal buffer represents the observed
 * value of the original signal at evenly spaced intervals of ~22 μs.
 *
 */
TFFT.SAMPLE_RATE = 44100;

/*
 * The bandwidth represents the size (in Hz) of the discrete frequency "buckets"
 * or more commonly, "bands", in the frequency domain.  An intuitive
 * explanation of frequency bands is that since we are dealing with *discrete* time
 * domain signals, our knowledge of the exact frequencies in a signal is limited in
 * direct relationship to the number of times we can observe the signal in a given time
 * interval.  Therefore, the frequency information tends to "smear" around the frequency bands
 * and effectively average the frequency values around the center (mean) of each band.
 *
 * This is not to be confused with the cutoff frequency, which is determined by the Nyquist
 * sample rate and caused by the inability of a discrete time signal to distinguish frequencies
 * that oscillate a certain amount faster than sample interval.
 *
 * A more detailed mathematical explanation requires a bit more knowledge of the continuous time
 * Fourier transform.  The so-called "Bandpass" theorem is a mathematical derivation of the following.
 */
TFFT.BANDWIDTH = 2.0 / TFFT.BUFFER_SIZE * TFFT.SAMPLE_RATE / 2.0;

/*
 * Returns the band frequency an index represents in the frequency domain buffer.
 */
TFFT.getBandFrequency = function(index) {
    return TFFT.BANDWIDTH * index + TFFT.BANDWIDTH / 2.0;
};

/*
 * The */
TFFT.SignalModel = Backbone.Model.extend({
    defaults: {
        waveForm: DSP.SINE,
        frequency: 400,
        amplitude: 1.0
    },

    getOscillator: function() {
        return new Oscillator(
            this.get("waveForm"),
            this.get("frequency"),
            this.get("amplitude"),
            TFFT.BUFFER_SIZE,
            TFFT.SAMPLE_RATE);
    }
});

TFFT.SignalCollection = Backbone.Collection.extend({
    model: TFFT.SignalModel,

    getTotalSignal: function() {
        var sumOscillator = this.first().getOscillator();
        sumOscillator.generate();
        _.each(this.rest(), function (signal) {
            sumOscillator.addSignal(signal.getOscillator().generate());
        });

        return sumOscillator.signal;
    },

    getFFT: function() {
        var fft = new FFT(TFFT.BUFFER_SIZE, TFFT.SAMPLE_RATE);
        fft.forward(this.getTotalSignal());
        return fft;
    }
});

TFFT.Signals = new TFFT.SignalCollection();

TFFT.SignalTransformGraph = Backbone.View.extend({
    className: 'signal-transform-graph',

    initialize: function(options) {
        this.width = options.width || 640;
        this.height = options.height || 480;
        this.margin = 40;

        this.chart = d3.select(this.el)
        .append("svg")
        .attr("class", "chart")
        .attr("width", this.width)
        .attr("height", this.height);

        this.x = d3.scale.linear()
        .domain([0, TFFT.BUFFER_SIZE / 2.0])
        .range([this.margin, this.width - this.margin]);

        var that = this;

        this.chart.selectAll(".xLabel")
        .data(this.x.ticks(16))
        .enter()
        .append("svg:text")
        .attr("class", "xLabel")
        .text(function (d) { n = Math.round(TFFT.getBandFrequency(d)); return n - n % 5; })
        .attr("x", function(d) { return that.x(d); })
        .attr("y", this.height - this.margin / 2)
        .attr("text-anchor", "middle")
        .attr("transform", function(d) { return "rotate(45," + that.x(d) + "," + that.height + ")"; });

        this.y = d3.scale.linear()
        .domain([0, 1.0])
        .range([this.margin, this.height - this.margin]);

        var zeroes = _.map(_.range(0, TFFT.BUFFER_SIZE / 2.0), Math.zeroFunction);
        this.chart.selectAll("rect")
        .data(zeroes)
        .enter()
        .append("rect")
        .attr("x", function(d, i) { return that.x(i) - 0.5; })
        .attr("y", function(d) { return that.height - that.y(d) - 0.5; })
        .attr("width", function(d) { return 2.0; })
        .attr("height", function(d) { return that.y(d) - that.margin; });

        this.collection.on("all", this.render, this);
    },

    render: function() {
        var fft = this.collection.getFFT();
        var spectrum = _.map(fft.spectrum, Math.toDecibels);
        var spectrumMax = d3.max(spectrum);
        spectrum = _.map(spectrum, function(s) { return s - spectrumMax; }); // normalize to 0 db
        var spectrumMin = d3.min(spectrum);
        this.y = d3.scale.linear()
        .domain([spectrumMin, 0.0])
        .range([this.margin, this.height - this.margin]);

        var that = this;
        this.chart.selectAll("rect")
        .data(spectrum)
        .transition()
        .attr("y", function(d) { return that.height - that.y(d) - 0.5; })
        .attr("height", function(d) { return that.y(d) - that.margin; });

        return this;
    }
});

TFFT.WAVEFORMS = {
    'Sine': DSP.SINE,
    'Triangle': DSP.TRIANGLE,
    'Saw': DSP.SAW,
    'Square': DSP.SQUARE,
    'Noise': DSP.NOISE
},

TFFT.SignalView = Backbone.View.extend({
    className: 'signal-control',

    events: {
        'change input': 'updateSignal'
    },

    template: _.template($('#signal_view_template').html()),

    initialize: function(options) {
        if (!options.model) {
            this.model = new TFFT.SignalModel();
        }

        this.model.on('change', this.render, this);
    },

    render: function() {
        $(this.el).html(this.template({
            id: this.model.cid,
            waveforms: TFFT.WAVEFORMS,
            signal: this.model }));
        this.$('.frequency-slider').slider({
            value: this.model.get('frequency'),
            min: 0,
            max: TFFT.SAMPLE_RATE / 2.0,
            slide: this.handleSliderChange('frequency')
        });
        this.$('.amplitude-slider').slider({
            value: this.model.get('amplitude'),
            min: 0,
            max: 100,
            slide: this.handleSliderChange('amplitude')
        });
        return this;
    },

    handleSliderChange: function(attribute) {
        return _.debounce(_.bind(function(event, ui) {
            this.model.set(attribute, ui.value);
        }, this),
        100);
    },

    updateSignal: function() {
        this.model.set({
            frequency: parseFloat(this.$('input[name="frequency"]').val()),
            amplitude: parseFloat(this.$('input[name="amplitude"]').val()),
            waveForm: parseInt(this.$('input:checked').val())
        });
    }
});

TFFT.ApplicationView = Backbone.View.extend({

    initialize: function(options) {
        this.transformView = new TFFT.SignalTransformGraph({
            width: this.options.width || 1000,
            height: this.options.height || 400,
            collection: TFFT.Signals
        });
        this.$el.append(this.transformView.el);
        var initialSignal = new TFFT.SignalModel({
            frequency: 7040
        });
        TFFT.Signals.add(initialSignal);
        var initialSignalView = new TFFT.SignalView({
            model: initialSignal
        });
        this.$el.append(initialSignalView.render().el);
    }
});