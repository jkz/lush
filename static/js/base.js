// Copyright © 2013 Hraban Luyat <hraban@0brg.net>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.


// GENERIC UTILITIES


// tries to parse JSON returns {} on any failure
var safeJSONparse = function (text) {
    // how wrong is a wild-card catch in JS?
    try {
        return JSON.parse(text);
    } catch(e) {
        return {};
    }
};

// repeat f every ms milliseconds as long as it returns true.
var repeatExec = function (f, ms) {
    if (f()) {
        window.setTimeout(repeatExec, ms, f, ms);
    }
};

// analogous to CL's function by the same name
var constantly = function (val) {
    return function () { return val; }
};

// analogous to Python's operator.attrgetter
var attrgetter = function (attr) {
    return function (obj) {
        return obj[attr];
    };
};

var identity = function (x) {
    return x;
};

// copy ar but remove all values that evaluate to false (0, "", false, ...)
var removeFalse = function (ar) {
    return $.grep(ar, identity);
};

// transform an array of objects into a mapping from key to array of objects
// with that key.
// compare to SQL's GROUP BY, with a custom function to evaluate which group an
// object belongs to.
var groupby = function (objs, keyfun) {
    var groups = {};
    $.map(objs, function (obj) {
        key = keyfun(obj);
        // [] if no such group yet
        groups[key] = (groups[key] || []).concat(obj);
    });
    return groups;
};

var curry = function (f) {
    var fixargs = Array.prototype.slice.call(arguments, 1);
    return function () {
        var restargs = Array.prototype.slice.call(arguments);
        return f.apply(this, fixargs.concat(restargs));
    };
};


// PROJECT LOCAL UTILTIES


// Call given function whenever the specified stream from this
// command has an update It is called with the new data so eg if a
// stream produces two bytes A and B the following might happen:
// callback("AB"); or callback("A"); callback("B");
var monitorstream = function (sysid, stream, callback) {
    var uri = 'ws://' + document.location.host + '/'
            + sysid + '/stream/' + stream + '.bin';
    var ws = new WebSocket(uri);
    ws.onmessage = function (e) {
        callback(e.data);
    };
};

// append text data to contents of jquery node
var appendtext = function ($node, text) {
    return $node.text($node.text() + text);
}
