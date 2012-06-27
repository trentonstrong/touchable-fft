
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

 Math.randInt = function(max, min) {
    if (min === undefined) {
        min = 0;
    }
    return Math.floor( Math.random() * max  + min);
}
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
    },

    save: function() {
        // NO-OP
    }
});

TFFT.Window = new WindowFunction(DSP.HANN);

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


TFFT.Signals = new TFFT.SignalCollection;


TFFT.SignalTransformGraph = Backbone.View.extend({
    className: 'graph',

    initialize: function(options) {
        this.width = options.width || 640;
        this.height = options.height || 480;
        this.margin = 40;

        this.chart = d3.select(this.el)
        .append("svg")
        .attr("class", "chart")
        .attr("width", this.width)
        .attr("height", this.height);

        var gradient = this.chart.append("svg:defs")
        .append("svg:linearGradient")
        .attr("id", "signalGradient")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%")
        .attr("spreadMethod", "pad");

        gradient.append("svg:stop")
            .attr("offset", "0%")
            .attr("stop-color", "#DA70D6")
            .attr("stop-opacity", 1);

        gradient.append("svg:stop")
            .attr("offset", "50%")
            .attr("stop-color", "#9932CC")
            .attr("stop-opacity", 1);

        gradient.append("svg:stop")
            .attr("offset", "100%")
            .attr("stop-color", "#2E0854")
            .attr("stop-opacity", 1);

        var x = d3.scale.linear()
        .domain([0, TFFT.BUFFER_SIZE / 2.0])
        .rangeRound([this.margin / 2.0, this.width - (this.margin / 2.0)]);

        var that = this;

        this.chart.selectAll(".xLabel")
        .data(x.ticks(16))
        .enter()
        .append("svg:text")
        .attr("class", "xLabel")
        .text(function (d) { n = Math.round(TFFT.getBandFrequency(d)); return n - n % 5; })
        .attr("x", function(d) { return x(d); })
        .attr("y", this.height - this.margin / 2)
        .attr("style", "fill:green")
        .attr("text-anchor", "middle")
        .attr("transform", function(d) { return "rotate(45," + x(d) + "," + that.height + ")"; });

        var y = d3.scale.linear()
        .domain([0, 1.0])
        .range([this.margin, this.height - this.margin]);

        var zeroes = _.map(_.range(0, TFFT.BUFFER_SIZE / 2.0), Math.zeroFunction);
        
        this.chart.selectAll("rect")
        .data(zeroes)
        .enter()
        .append("rect")
        .attr("x", function(d, i) { return x(i); })
        .attr("y", function(d) { return that.height - y(d) - 0.5; })
        .attr("width", function(d) { return 2.0; })
        .attr("height", function(d) { return y(d) - that.margin; });

        this.collection.on("all", this.render, this);
    },

    render: function() {
        var fft = this.collection.getFFT();
        var spectrum = _.map(fft.spectrum, Math.toDecibels);
        var spectrumMax = d3.max(spectrum);
        spectrum = _.map(spectrum, function(s) { return s - spectrumMax; }); // normalize to 0 db
        var spectrumMin = d3.min(spectrum);
        
        var y = d3.scale.linear()
            .domain([spectrumMin, 0.0])
            .range([this.margin, this.height - this.margin]);

        var yAxis = d3.svg.axis()
            .scale(y)
            .orient("left")

        this.chart.append("g")
            .attr("class", "y axis")
            .call(yAxis);

        var that = this;
        this.chart.selectAll("rect")
        .data(spectrum)
        .transition()
        .attr("style", function(d) { return "fill:url(#signalGradient);"; })
        .attr("y", function(d) { return that.height - y(d) - 0.5; })
        .attr("height", function(d) { return y(d) - that.margin; });

        return this;
    }
});

TFFT.SignalTransformGraphView = Backbone.View.extend({
    className: 'graph',

    initialize: function(options) {
        this.width = options.width || 640;
        this.height = options.height || 480;
        this.margin = {top: 10, right: 10, bottom: 20, left: 40} || options.margin;
        this.width = this.width - this.margin.left - this.margin.right,
        this.height = this.height - this.margin.top - this.margin.bottom;

        this.chart = d3.select(this.el)
            .append("svg")
            .attr("class", "chart")
            .attr("width", this.width + this.margin.left + this.margin.right)
            .attr("height", this.height + this.margin.top + this.margin.bottom)
            .append("g")
            .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        // define gradient for signal bars
        var gradient = this.chart.append("svg:defs")
            .append("svg:linearGradient")
            .attr("id", "signalGradient")
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "0%")
            .attr("y2", "100%")
            .attr("spreadMethod", "pad");
        gradient.append("svg:stop")
            .attr("offset", "0%")
            .attr("stop-color", "#DA70D6")
            .attr("stop-opacity", 1);
        gradient.append("svg:stop")
            .attr("offset", "50%")
            .attr("stop-color", "#9932CC")
            .attr("stop-opacity", 1);
        gradient.append("svg:stop")
            .attr("offset", "100%")
            .attr("stop-color", "#2E0854")
            .attr("stop-opacity", 1);

        // frequency axis
        var frequency = d3.scale.linear()
            .domain([0, TFFT.BUFFER_SIZE / 2.0])
            .range([0, TFFT.getBandFrequency(TFFT.BUFFER_SIZE / 2.0)])

        var x = d3.scale.linear()
            .domain([0, frequency(TFFT.BUFFER_SIZE / 2.0)])
            .rangeRound([0, this.width]);

        var xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom")

        this.chart.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + this.height + ")")
            .call(xAxis);

        // initialize rects 0 height to enable transform animation on first render
        var that = this;
        var zeroes = _.map(_.range(0, TFFT.BUFFER_SIZE / 2.0), Math.zeroFunction);        
        this.chart.selectAll("rect")
            .data(zeroes)
            .enter()
            .append("rect")
            .attr("x", function(d, i) { return x(frequency(i)); })
            .attr("y", function(d) { return that.height; })
            .attr("width", function(d) { return 1.0; })
            .attr("height", function(d) { return d; });

        this.collection.on("all", this.render, this);
    },

    render: function() {
        this.chart.select("g.y").remove();

        var fft = this.collection.getFFT();
        var spectrum = _.map(fft.spectrum, Math.toDecibels);
        var spectrumMax = d3.max(spectrum);
        spectrum = _.map(spectrum, function(s) { return s - spectrumMax; }); // normalize to 0 db
        var spectrumMin = d3.min(spectrum);
        
        var y = d3.scale.linear()
            .domain([spectrumMin, 0.0])
            .range([this.height, 0]);

        var yAxis = d3.svg.axis()
            .scale(y)
            .orient("left")

        this.chart.append("g")
            .attr("class", "y axis")
            .call(yAxis);

        var that = this;
        this.chart.selectAll("rect")
            .data(spectrum)
            .transition()
            .attr("style", function(d) { return "fill:url(#signalGradient);"; })
            .attr("y", function(d) { return y(d) - 0.5; })
            .attr("height", function(d) { return that.height - y(d); });

       return this; 
    }


});

TFFT.SignalGraphView = Backbone.View.extend({

    className: 'graph',

    initialize: function(options) {
        this.width = options.width || 640;
        this.height = options.height || 480;
        this.margin = {top: 10, right: 10, bottom: 20, left: 50} || options.margin;
        this.width = this.width - this.margin.left - this.margin.right,
        this.height = this.height - this.margin.top - this.margin.bottom;

        this.chart = d3.select(this.el)
        .append("svg")
        .attr("class", "chart")
        .attr("width", this.width + this.margin.left + this.margin.right)
        .attr("height", this.height + this.margin.top + this.margin.bottom)
        .append("g")
            .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        this.time = d3.scale.linear()
            .domain([0, TFFT.BUFFER_SIZE])
            .range([0, TFFT.BUFFER_SIZE / TFFT.SAMPLE_RATE ]);

        this.x = d3.scale.linear()
            .domain([0, this.time(TFFT.BUFFER_SIZE)])
            .rangeRound([0, this.width]);

        var xAxis = d3.svg.axis()
            .scale(this.x)
            .orient("bottom");

        this.chart.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + this.height / 2.0 + ")")
            .call(xAxis);

        this.collection.on("all", this.render, this);
    },

    render: function() {
        // remove y axis and previous plot, if any
        this.chart.select("g.y").remove();
        this.chart.select("path.line").remove();

        var signal = this.collection.getTotalSignal();
        this.chart.datum(signal);

        var y = d3.scale.linear()
            .domain(d3.extent(signal))
            .range([this.height, 0]);

        var yAxis = d3.svg.axis()
            .scale(y)
            .orient("left")
            .tickFormat(d3.format('.02f'));

        var that = this;
        var line = d3.svg.line()
            .x(function(d, i) { return that.x(that.time(i)); })
            .y(function(d) { return y(d); });

        this.chart.append("g")
            .attr("class", "y axis")
            .call(yAxis);

        this.chart.append("path")
            .attr("class", "line")
            .attr("d", line);

        return this;
    }

});

TFFT.WAVEFORMS = {
    'Sine': DSP.SINE,
    'Triangle': DSP.TRIANGLE,
    'Saw': DSP.SAW,
    'Square': DSP.SQUARE,
    'Noise': DSP.NOISE
};

TFFT.SignalView = Backbone.View.extend({
    tagName: 'div',

    className: 'signal-control ui-widget',

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
            id: this.model.id,
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

    events: {
        'click .add': 'createSignal'
    },

    initialize: function(options) {
        this.$('.tabs').tabs();
        this.signalCount = 0;
        this.transformView = new TFFT.SignalTransformGraphView({
            width: options.width || 900,
            height: options.height || 400,
            collection: TFFT.Signals
        });

        this.inputView = new TFFT.SignalGraphView({
            width: options.width || 900,
            height: options.height || 400,
            collection: TFFT.Signals
        });

        this.$('#signalTransformTab').append(this.transformView.el);
        this.$('#signalInputTab').append(this.inputView.el);
        TFFT.Signals.on('add', this.addSignal, this);
    },

    createSignal: function(event) {
        this.signalCount++;
        TFFT.Signals.create({ id: this.signalCount });
    },

    addSignal: function(signal) {
        var signalView = new TFFT.SignalView({
            model: signal
        });
        this.$('.signal-panel >.new').before(signalView.render().el);
    }
});