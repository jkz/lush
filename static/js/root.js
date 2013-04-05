var stat2html = function(id, stat) {
    switch(stat) {
    case 0:
        return '<form method=post action="/' + id + '/start" class="start-btn"> <button>start</button> </form>';
    case 1:
        return '⌚';
    case 2:
        return '✓';
    case 3:
        return '✗';
    }
};

$(document).ready(function() {
    $.map(cmds, function(e, i) {
        $('#cmds').append($(
            '<div class="cmd" id="cmd' + e.id + '">' +
            '<a href="/' + e.id + '/">' + e.id + ': ' +
            '<tt>' + e.argv.join(" ") + '</tt></a> ' +
            stat2html(e.id, e.status) + '</p>'));
    });
});
