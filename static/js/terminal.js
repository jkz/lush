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


// TERMINAL HANDLING

"use strict";

// jQuery terminal plugin object
var term;

// Print text to this terminal. Ensures the text always ends in newline.
var termPrintln = function (term, text, finalize) {
    // term.echo will always append newline so strip one off if exists
    if (hassuffix(text, '\r\n')) {
        text = text.slice(0, -2);
    } else if (hassuffix(text, '\n')) {
        text = text.slice(0, -1);
    }
    text = escapeHTML(text);
    // jquery.terminal interprets square brackets
    text = text.replace(/\[/g, '&#91;');
    return term.echo(text, finalize);
};

var parseerror = function (msg, pos) {
    return {
        pos: pos,
        msg: msg,
    };
};

// First level of prompt parsing: strip quotes.
// Returns parsed argument vector as array on success, error object on failure
var parsePromptLvl1 = function (text) {
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

var startsWithDot = function (str) {
    return str[0] == ".";
}

// list of files matching a pattern. if showhidden is false this excludes files
// starting with a dot. if showhidden is not specified this only shows those
// files if the pattern itself starts with a dot.
var glob = function (pattern, showhidden) {
    var files = [];
    $.ajax('/files.json', {
        data: {pattern: pattern},
        success: function (x) {
            files = x;
        },
        async: false});
    if (showhidden === undefined) {
        showhidden = startsWithDot(pattern);
    }
    if (!showhidden) {
        files = $.grep(files, startsWithDot, true);
    }
    return files;
};

// Parse array of level 1 blocks: file globbing
var parsePromptLvl2 = function (lvl1argv) {
    if (!$.isArray(lvl1argv)) {
        return lvl1argv;
    }
    var argv = [];
    for (var i = 0; i < lvl1argv.length; i++) {
        var arg = lvl1argv[i];
        if (hasGlobChar(arg.text)) {
            var files = glob(arg.text);
            if (files.length == 0) {
                return parseerror("No match for pattern " + arg.text, arg.pos);
            }
            argv = argv.concat($.map(files, function (fname) {
                return {
                    pos: arg.pos,
                    text: promptEscape(fname),
                };
            }));
        } else {
            argv.push(arg);
        }
    }
    return argv;
};

var parsePrompt = function (text) {
    var argv = parsePromptLvl2(parsePromptLvl1(text));
    return argv;
};

// process a line entered at the command prompt
var handlePrompt = function (text, term) {
    var argv = parsePrompt(text);
    if (!$.isArray(argv)) {
        term.error("Parse error: " + argv.msg);
        term.error("");
        term.error(text);
        term.error(" ".repeat(argv.pos) + "^");
        return;
    }
    argv = $.map($.map(argv, attrgetter("text")), promptUnescape);
    if (argv.length == 0) {
        return;
    }
    var cmdform = $('form[action="/new"]')[0];
    $('input[name=cmd], input[name^=arg]', cmdform).val('');
    cmdform.cmd.value = argv[0];
    cmdform.name.value = argv.join(' ');
    for (var i = 1; i < argv.length; i++) {
        var $input = $('input[name=arg'+i+']', cmdform);
        if ($input.length == 0) {
            $input = $('<input name=arg'+i+'>');
            $(cmdform).append($input);
        }
        $input.val(argv[i])
    }
    $(cmdform).submit();
};

// Escape a string such that parsing it will return the original string
var promptEscape = function (str) {
    return str.replace(/([\\?* "'])/g, "\\$1");
};

var promptUnescape = function (str) {
    return str.replace(/\\(.)/g, "$1");
};

// send what is currently on the prompt to the terminal output
var echoInput = function (term) {
    return termPrintln(term, term.get_prompt() + term.get_command());
};

// Called with array of filenames to populate a partially completed command
// line word as a file. The "partial" argument is the snippet the user is
// trying to tab complete
var tabcompleteCallback = function (term, partial, files) {
    files = $.map(files, promptEscape);
    if (files.length == 0) {
        return;
    }
    if (files.length == 1) {
        term.insert(files[0].slice(partial.length) + " ");
        return;
    }
    var pref = lcp(files);
    if (pref.length > partial.length) {
        // all possible completions share a prefix longer than current partial
        term.insert(pref.slice(partial.length));
        return;
    }
    echoInput(term);
    $.each(files, function (_, x) { termPrintln(term, x); });
};

var terminalHTML = function () {
    return "<div class=terminalwrap1><div class=terminalwrap2>" +
            "<div class='termdraghandle ui-state-default ui-state-active'>" +
                "<span class='ui-icon ui-icon-arrow-4'></span>" +
            "</div>" +
            "<div class=terminal ></div>" +
        "</div></div>";
};

// create a new terminal window and append to HTML body
var createTerminal = function () {
    var $wrap = $(terminalHTML()).appendTo($('body'));
    $wrap.resizable().draggable({handle: $('.termdraghandle', $wrap)})
    return $('.terminal', $wrap).terminal(handlePrompt, {
        greetings: 'Welcome to Luyat shell',
        name: 'lush',
        prompt: '$ ',
        tabcompletion: true,
        // completion for files only
        completion: function (term) {
            var argv = parsePrompt(term.get_command());
            if (!$.isArray(argv)) {
                // parse error
                return;
            }
            if (argv.length < 2) {
                // only works on filenames
                return;
            }
            var partial = argv.pop().text;
            var pattern = promptUnescape(partial) + "*";
            // home grown callback function
            var callback = curry(tabcompleteCallback, term, partial);
            $.get('/files.json', {pattern: pattern}, callback);
        },
    });
};
