// Copyright © 2013, 2014 Hraban Luyat <hraban@0brg.net>
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

    Parser.errcodes = {
        UNBALANCED_SINGLE_QUOTE: 1,
        UNBALANCED_DOUBLE_QUOTE: 2,
        TERMINATING_BACKSLASH: 3,
    };

    function makeParseError(msg, errobj) {
        return $.extend(new Error(msg), {name: "ParseError"}, errobj);
    }

    function defaultOnError(err) {
        throw err;
    }

    Parser.prototype._callOnError = function (errobj) {
        var parser = this;
        (parser.onerror || defaultOnError)(makeParseError(errobj));
    };

    // the next char that will be popped. undefined at end of input
    Parser.prototype.peek = function () {
        if (this.state.idx < this.state.raw.length) {
            return this.state.raw[this.state.idx];
        }
    };

    // pop a character off the input. returns undefined when end of input has
    // been reached
    Parser.prototype.popc = function () {
        var parser = this;
        if (parser.state.idx < parser.state.raw.length) {
            var c = parser.state.raw[parser.state.idx];
            parser.state.idx++;
            return c;
        }
    };

    // in single quote mode, only a ' changes state
    function parse_char_quote_single(parser, c, i) {
        if (c === undefined) {
            parser._callOnError("unbalanced single quotes",
                                Parser.errcodes.UNBALANCED_SINGLE_QUOTE);
            return;
        }
        if (c == "'") {
            return parse_char_normal;
        }
        parser.onliteral(c);
    }

    // in double quote mode, only a " changes state
    function parse_char_quote_double(parser, c, i) {
        if (c === undefined) {
            parser._callOnError("unbalanced double quotes",
                                Parser.errcodes.UNBALANCED_DOUBLE_QUOTE);
            return;
        }
        if (c == '"') {
            return parse_char_normal;
        }
        parser.onliteral(c);
    }

    function parse_char_escaped(parser, c, i) {
        if (c === undefined) {
            parser._callOnError("backslash at end of input",
                                Parser.errcodes.TERMINATING_BACKSLASH);
            return;
        }
        parser.onliteral(c);
        // escaping only lasts one char
        return parse_char_normal;
    }

    function parse_char_normal(parser, c, i) {
        if (c === undefined) {
            if (parser.state.parsingword) {
                parser.onboundary();
            }
            return;
        }
        // these chars have special meaning
        switch (c) {
        case "'":
            // Start new single quoted block
            parser.state.quotestart = i;
            parser.state.parsingword = true;
            return parse_char_quote_single;
        case '"':
            // Start new double quoted block
            parser.state.quotestart = i;
            parser.state.parsingword = true;
            return parse_char_quote_double;
        case '\\':
            parser.state.parsingword = true;
            return parse_char_escaped;
        case ' ':
            // Word boundary
            if (parser.state.parsingword) {
                parser.onboundary();
                parser.state.parsingword = false;
            }
            break;
        case '*':
            parser.onglobStar(i);
            parser.state.parsingword = true;
            break;
        case '?':
            parser.onglobQuestionmark(i);
            parser.state.parsingword = true;
            break;
        case '|':
            if (parser.state.parsingword) {
                parser.onboundary();
                parser.state.parsingword = false;
            }
            parser.onpipe();
            break;
        default:
            parser.onliteral(c);
            parser.state.parsingword = true;
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
        if (!this.onpipe) {
            this.onpipe = function () {
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
        // only called for parse errors
        if (!this.onerror) {
            this.onerror = defaultOnError;
        }
        this.state.raw = raw;
        var f = parse_char_normal; // ISA state as function
        var c;
        // do while so that a last c === undefined still gets handled (notify
        // state func of EOF)
        do {
            var i = this.state.idx;
            c = this.popc();
            f = f(this, c, i) || f;
        } while (c !== undefined);
    };

    return Parser;
});
