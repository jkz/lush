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
        // in quoting mode, only look for closing quote
        switch (this.state.quotetype) {
        case QUOTE_SINGLE:
            if (c == "'") {
                this.state.quotetype = QUOTE_NONE;
            } else {
                this.onliteral(c);
            }
            return;
        case QUOTE_DOUBLE:
            if (c == '"') {
                this.state.quotetype = QUOTE_NONE;
            } else {
                this.onliteral(c);
            }
            return;
        }
        // not quoted, these chars have special meaning
        switch (c) {
        case "'":
            // Start new single quoted block
            this.state.quotetype = QUOTE_SINGLE;
            this.state.quotestart = i;
            this.state.parsingword = true;
            break;
        case '"':
            // Start new double quoted block
            this.state.quotetype = QUOTE_DOUBLE;
            this.state.quotestart = i;
            this.state.parsingword = true;
            break;
        case '\\':
            if (!this.peek()) {
                throw "parser error: backslash at end of input";
            }
            // inside and outside quoting: next char is a literal
            this.onliteral(this.popc());
            this.state.parsingword = true;
            break;
        case ' ':
            // Word boundary
            if (this.state.parsingword) {
                this.onboundary();
                this.state.parsingword = false;
            }
            break;
        case '*':
            this.onglobStar(i);
            this.state.parsingword = true;
            break;
        case '?':
            this.onglobQuestionmark(i);
            this.state.parsingword = true;
            break;
        case '|':
            if (this.state.parsingword) {
                this.onboundary();
                this.state.parsingword = false;
            }
            this.onpipe1();
            break;
        case '2':
            // stderr pipe (importantd 2| mail -s ohnoes root)
            if (this.peek() == '|' &&
                i > 0 &&
                /\s/.test(this.state.raw[i-1]))
            {
                if (this.state.parsingword) {
                    this.onboundary();
                    this.state.parsingword = false;
                }
                this.popc();
                this.onpipe2();
            } else {
                this.onliteral(c);
            }
            break;
        default:
            this.onliteral(c);
            this.state.parsingword = true;
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
            // idea behind this: set to true at every char that is part of a
            // word (non-space, non-special like pipe), on every space char (or
            // other special char) generate an onboundary event if this is false
            // then set it to false. also generate the event at end of input.
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
        if (!this.onpipe1) {
            this.onpipe1 = function () {
                this.onliteral('|');
            };
        }
        if (!this.onpipe1) {
            this.onpipe1 = function () {
                this.onliteral('2');
                this.onliteral('|');
            };
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
