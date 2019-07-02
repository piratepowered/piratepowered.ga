var links = `PASTE LIST FROM OPENLOAD HERE`;
links = links.split("\n");

var games = JSON.parse(document.body.innerText); // http://api.steampowered.com/ISteamApps/GetAppList/v2/
games.applist.apps.forEach(app => {
    app.name = app.name.replace(/\&/g, ".And.").replace(/[^a-zA-Z0-9\-\.\(\{\[\]\}\) ]/g, "").replace(/ |\-|\(|\{|\[|\]|\}|\)/g, ".").replace(/\.(\.)+/g, ".").replace(/\.$|^\./g, "") + ".V" + date;
});

var downloads = {};
var toremove = [];
links.forEach(link => {
    var name = link.split("/")[5].split(".V20")[0];
    var date = link.split("/")[5].split(".V");
    date = date[date.length - 1].split(".")[0];
    var app = games.applist.apps.filter(app => { return app.name == name && app.name.length > 0 })[0];
    if (app) {
        if (downloads[app.appid]) {
            if (downloads[app.appid][date]) {
                downloads[app.appid][date].push(link);
            } else {
                downloads[app.appid][date] = [link]
            }
        } else {
            var obj = {}
            obj[date] = [link];
            downloads[app.appid] = obj;
        }
        toremove.push(link);
    }
});
toremove.forEach(link => {
    links.splice(links.indexOf(link), 1);
});
console.log(links.join("\r\n"));
console.log(JSON.stringify(downloads, null, 4));