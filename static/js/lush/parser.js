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


// PROMPT PARSING

define(function () {

    var Parser = function (glob) {
        this.glob = glob;
    }

    // First level of prompt parsing: strip quotes.
    // Returns parsed argument vector as array on success, error object on failure
    Parser.prototype._parseLvl1 = function (text) {
        // array of word objects: {text: string, pos: int}
        var argv = [];
        // Quote flag state in parsing
        var QUOTE_NONE = 0;
        var QUOTE_SINGLE = 1;
        var QUOTE_DOUBLE = 2;
        var quote = {
            type: QUOTE_NONE,
            // Index of opening quote
            start: null,
        }
        var i = 0;
        // Incrementally increased until boundary then pushed on argv
        // not runtime efficient but can easily be improved later by using indices
        var word = null; // null = no word
        // Push the current word on the argument list
        var pushword = function () {
            if (word !== null) {
                argv.push(word);
            }
            word = null;
        }
        // Also a word if left empty (e.g. "")
        var ensureword = function () {
            word = word || {text: "", pos: i};
        }
        var pushchar = function (c) {
            if (c === undefined) {
                c = text[i];
            }
            ensureword();
            word.text += c;
        }
        for (i = 0; i < text.length; i++) {
            var c = text[i];
            switch (c) {
            case "'":
                switch (quote.type) {
                case QUOTE_NONE:
                    // Start new single quoted block
                    quote.type = QUOTE_SINGLE;
                    quote.start = i;
                    ensureword();
                    break;
                case QUOTE_SINGLE:
                    // End single quoted block
                    quote.type = QUOTE_NONE;
                    break;
                case QUOTE_DOUBLE:
                    // Single quote in double quoted block: normal char
                    pushchar();
                    break;
                }
                break;
            case '"':
                switch (quote.type) {
                case QUOTE_NONE:
                    // Start new double quoted block
                    quote.type = QUOTE_DOUBLE;
                    quote.start = i;
                    ensureword();
                    break;
                case QUOTE_SINGLE:
                    // Double quotes in single quoted block: normal char
                    pushchar();
                    break;
                case QUOTE_DOUBLE:
                    // End double quoted block
                    quote.type = QUOTE_NONE;
                    break;
                }
                break;
            case '\\':
                if (i >= text.length - 1) {
                    return parseerror("backslash at end of input", i);
                }
                // Yes, copy the backslash (this is lvl 1)
                pushchar();
                i++;
                pushchar();
                break;
            case ' ':
                if (quote.type) {
                    // Quoted escape
                    pushchar('\\');
                    pushchar();
                } else {
                    // treat multiple consecutive spaces as one
                    while (i < text.length - 1 && text[i+1] == ' ') {
                        i++;
                    }
                    // Word boundary
                    pushword();
                }
                break;
            // Special characters outside quoting
            case '*':
            case '?':
                if (quote.type) {
                    pushchar('\\');
                }
                // fallthrough
            default:
                pushchar();
                break;
            }
        }
        pushword();
        if (quote.type != QUOTE_NONE) {
            var qname = (quote.type == QUOTE_DOUBLE ? "double" : "single");
            return parseerror("unbalanced " + qname + " quotes", quote.start);
        }
        return argv;
    };

    // Contains an unescaped ? or *
    var hasGlobChar = function (str) {
        // equivalent: (?<=\\)[?*]
        return /^(?:(?!\\[?*]).)*[?*]/.test(str)
    };

    // Escape a string such that parsing it will return the original string
    Parser.prototype.escape = function (str) {
        return str.replace(/([\\?* "'])/g, "\\$1");
    };

    Parser.prototype.unescape = function (str) {
        return str.replace(/\\(.)/g, "$1");
    };

    // Parse array of level 1 blocks: file globbing
    Parser.prototype._parseLvl2 = function (lvl1argv) {
        if (!$.isArray(lvl1argv)) {
            return lvl1argv;
        }
        var argv = [];
        for (var i = 0; i < lvl1argv.length; i++) {
            var arg = lvl1argv[i];
            if (hasGlobChar(arg.text)) {
                var files = this.glob(arg.text);
                if (files.length == 0) {
                    return parseerror("No match for pattern " + arg.text, arg.pos);
                }
                argv = argv.concat($.map(files, function (fname) {
                    return {
                        pos: arg.pos,
                        text: this.escape(fname),
                    };
                }));
            } else {
                argv.push(arg);
            }
        }
        return argv;
    };

    Parser.prototype.parse = function (text) {
        var argv = this._parseLvl2(parseLvl1(text));
        return argv;
    };

    return Parser;
});
