var stat2html = function(id, stat) {
    switch(stat) {
    case 0:
        return '<form method=post action="/' + id + '/start" class="start-cmd"> <button>start</button> </form>';
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
    $('.cmd').draggable();
    $('form.start-cmd').submit(function(e) {
        $.post(e.target.action + "?noredirect", $(this).serialize())
         .success(function() {
             $(e.target).html('⌚');
         })
         .fail(function() {
             $(e.target).html('✗');
         });
         return false;
    });
});
