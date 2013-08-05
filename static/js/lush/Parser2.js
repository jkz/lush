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
    // Quote flag state in parsing
    var QUOTE_NONE = 0;
    var QUOTE_SINGLE = 1;
    var QUOTE_DOUBLE = 2;

    var Parser = function () {
    };

    // the next char that will be popped. undefined at end of input
    Parser.prototype.peek = function () {
        if (this.state.idx < this.state.raw.length) {
            return this.state.raw[this.state.idx];
        }
    };

    // pop a character off the input
    Parser.prototype.popc = function () {
        if (!this.peek()) {
            throw "parser error: reached end of input";
        }
        var c = this.state.raw[this.state.idx];
        this.state.idx++;
        return c;
    };

    Parser.prototype.parsec = function (c, i) {
        // no matter what, if this char is not a space the next word boundary
        // should trigger an event.
        if (c != ' ') {
            this.state.parsingword = true;
        }
        switch (c) {
        case "'":
            switch (this.state.quotetype) {
            case QUOTE_NONE:
                // Start new single quoted block
                this.state.quotetype = QUOTE_SINGLE;
                this.state.quotestart = i;
                break;
            case QUOTE_SINGLE:
                // End single quoted block
                this.state.quotetype = QUOTE_NONE;
                break;
            case QUOTE_DOUBLE:
                // Single quote in double quoted block: normal char
                this.onliteral(c);
                break;
            }
            break;
        case '"':
            switch (this.state.quotetype) {
            case QUOTE_NONE:
                // Start new double quoted block
                this.state.quotetype = QUOTE_DOUBLE;
                this.state.quotestart = i;
                break;
            case QUOTE_SINGLE:
                // Double quotes in single quoted block: normal char
                this.onliteral(c);
                break;
            case QUOTE_DOUBLE:
                // End double quoted block
                this.state.quotetype = QUOTE_NONE;
                break;
            }
            break;
        case '\\':
            if (!this.peek()) {
                throw "parser error: backslash at end of input";
            }
            // inside and outside quoting: next char is a literal
            this.onliteral(this.popc());
            break;
        case ' ':
            if (this.state.quotetype) {
                this.onliteral(c);
            } else {
                // Word boundary
                if (this.state.parsingword) {
                    this.onboundary();
                }
                // treat multiple consecutive spaces as one
                while (this.peek() == ' ') {
                    this.popc();
                }
            }
            break;
        case '*':
            if (this.state.quotetype) {
                this.onliteral(c);
            } else {
                this.onglobStar(i);
            }
            break;
        case '?':
            if (this.state.quotetype) {
                this.onliteral(c);
            } else {
                this.onglobQuestionmark(i);
            }
            break;
        default:
            this.onliteral(c);
            break;
        }
    };

    Parser.prototype.parse = function (raw) {
        this.state = {
            raw: "",
            idx: 0,
            quotetype: QUOTE_NONE,
            // Index of opening quote
            quotestart: -1,
            // when true the next boundary will trigger an "onboundary" event.
            // idea behind this: set to true at every non-space char, on every
            // space char generate an onboundary event if this is false then
            // set it to false. also generate the event at end of input.
            parsingword: false,
        };
        if (this.oninit) {
            this.oninit();
        }
        if (!this.onliteral) {
            this.onliteral = function () {};
        }
        if (!this.onboundary) {
            this.onboundary = function () {};
        }
        // if no callback specified for ? treat it as literal
        if (!this.onglobQuestionmark) {
            this.onglobQuestionmark = function () {
                this.onliteral('?');
            };
        }
        // if no callback specified for * treat it as literal
        if (!this.onglobStar) {
            this.onglobStar = function () {
                this.onliteral('*');
            };
        }
        this.state.raw = raw;
        while (this.peek()) {
            var i = this.state.idx;
            var c = this.popc();
            this.parsec(c, i);
        }
        if (this.state.parsingword) {
            this.onboundary();
        }
    };

    return Parser;
});
