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

"use strict";


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

// repeat f every ms milliseconds as long as it returns true. if third argument
// is passed it is integer limiting how often function is repeated (but still
// if it returns false -> exit immediately). function is passed one argument
// the loop index so its really just like a delayed forloop.
var repeatExec = function (f, ms, n, i) {
    i = i || 0;
    if (n !== undefined) {
        n -= 1;
        if (n < 0) {
            return;
        }
    }
    if (f(i)) {
        i += 1;
        window.setTimeout(repeatExec, ms, f, ms, n, i);
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
        var key = keyfun(obj);
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

var hassuffix = function (str, suff) {
    return str.slice(-suff.length) == suff;
};

var escapeHTML = function (text) {
    // impressive for a lang that is by definition intended to mix with HTML
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
};

var min = function (x, y) {
    return x < y ? x : y;
};

var lcpbi = function (x, y) {
    var l = min(x.length, y.length);
    var i = 0;
    while (i < l && x[i] == y[i]) {
        i++;
    }
    return x.slice(0, i);
};

// longest common prefix
var lcp = function (seqs, i) {
    if (seqs.length == 0) {
        return "";
    }
    return seqs.reduce(lcpbi);
};

// http://stackoverflow.com/a/202627
String.prototype.repeat = function (num) {
    return new Array(num + 1).join(this);
};

String.prototype.splitn = function (sep, n) {
    var components = this.split(sep);
    var res = [];
    while (--n && components.length > 0) {
        res.push(components.shift());
    }
    if (components.length > 0) {
        res.push(components.join(sep));
    }
    return res;
};

// http://stackoverflow.com/a/950146
// $.getScript does not wait for execution
// but hey so doesnt want anonymous feedback well not my problem
// also holy shitballs js
var loadScript = function (url, callback)
{
    // adding the script tag to the head as suggested before
   var head = document.getElementsByTagName('head')[0];
   var script = document.createElement('script');
   script.type = 'text/javascript';
   script.src = url;

   // then bind the event to the callback function 
   // there are several events for cross browser compatibility
   script.onreadystatechange = callback;
   script.onload = callback;

   // fire the loading
   head.appendChild(script);
};

// serialize html form to jquery object ready for jsoning
// http://stackoverflow.com/a/1186309
$.fn.serializeObject = function()
{
    var o = {};
    var a = this.serializeArray();
    $.each(a, function() {
        if (o[this.name] !== undefined) {
            if (!o[this.name].push) {
                o[this.name] = [o[this.name]];
            }
            o[this.name].push(this.value || '');
        } else {
            o[this.name] = this.value || '';
        }
    });
    return o;
};


// PROJECT LOCAL UTILTIES

// create full websocket uri from relative path
var wsURI = function(path) {
    return 'ws://' + document.location.host + path;
};

// Call given function whenever the specified stream from this
// command has an update It is called with the new data so eg if a
// stream produces two bytes A and B the following might happen:
// callback("AB"); or callback("A"); callback("B");
// returns the websocket object associated with this monitor
var monitorstream = function (sysid, stream, callback) {
    var uri = wsURI('/' + sysid + '/stream/' + stream + '.bin');
    var ws = new WebSocket(uri);
    ws.onmessage = function (e) {
        callback(e.data);
    };
    return ws;
};

// append text data to contents of jquery node
var appendtext = function ($node, text) {
    return $node.text($node.text() + text);
};
