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
var termPrintln = function (term, text) {
    // term.echo will always append newline so strip one off if exists
    if (hassuffix(text, '\r\n')) {
        text = text.slice(0, -2);
    } else if (hassuffix(text, '\n')) {
        text = text.slice(0, -1);
    }
    text = escapeHTML(text);
    // jquery.terminal interprets square brackets
    text = text.replace(/\[/g, '&#91;');
    return term.echo(text);
};

// process a line entered at the command prompt
var handlePrompt = function (text, term) {
    var argv = parsePrompt(text);
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

$(document).ready(function () {
    // terminal window
    $('#terminalwrap1').draggable({handle: '#termdraghandle'}).resizable();
    term = $('#terminal').terminal(handlePrompt, {
        greetings: 'Welcome to Luyat shell',
        name: 'lush',
        prompt: '$ ',
        tabcompletion: true,
        // completion for files only
        completion: function (term, text, callback) {
            var pattern = text + "*";
            $.get('/files.json', {pattern: pattern}, callback);
        },
    });
});
