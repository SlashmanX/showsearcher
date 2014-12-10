var request = require('request'),
    xml2js = require('xml2js'),
    Q = require('q'),
    parser = new xml2js.Parser(),
    originalRequest;

var KICKASS_URL = 'http://kickass.so/';

//searching for the torrent
var getSearchRSS = function(searchString, callback) {
    var requestURL = KICKASS_URL + 'usearch/' + searchString,
        deferred = Q.defer();

    request(requestURL, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            deferred.resolve(body);
        } else {
            deferred.reject(new Error('Episode not found'));
        }
    });

    return deferred.promise.nodeify(callback);
}

//just parsing the search response
var parseRSS = function(rawBody, callback) {
    var deferred = Q.defer();

    parser.parseString(rawBody, function(err, result) {
        if (!err) {
            deferred.resolve(result);
        } else {
            deferred.reject(new Error('Couldn\'t parse response'));
        }
    });

    return deferred.promise.nodeify(callback);
}

//get the parsed rss, sort by seeds and get the best.
var findBestTorrent = function(data, callback) {
    var torrentList = data.rss.channel[0].item,
        torrent,
        deferred = Q.defer(),
        torrents = [];

    torrentList.sort(function(a, b) {
        return b['torrent:seeds'] - a['torrent:seeds'];
    });

    for(var i = 0; i < originalRequest.limit; i++) {

        if(!torrentList[i]) break;

        torrent = {
            showName: originalRequest.showName,
            season: originalRequest.season,
            episode: originalRequest.episode,
            quality: originalRequest.quality,
            torrentData: {
                title: torrentList[i].title[0],
                seeds: torrentList[i]['torrent:seeds'][0],
                fileName: torrentList[i]['torrent:fileName'][0].slice(0, torrentList[i]['torrent:fileName'][0].length - 8),
                torrent: torrentList[i].enclosure[0].$.url,
                magnetURI: torrentList[i]['torrent:magnetURI'][0],
                fileSize: torrentList[i].enclosure[0].$.length
            }
        }

        torrents.push(torrent)
    }

    deferred.resolve(torrents);
    return deferred.promise.nodeify(callback);

}


//util function to clean show name in case it brings weird characters
var cleanShowName = function(showName) {
    var newShowName = showName.replace(/\([0-9]{4}\)/g, '');
    newShowName = newShowName.replace(/[\']/g, '');
    newShowName = newShowName.replace(/[\(\)\:\!\?\,\.]/g, ' ');
    newShowName = newShowName.replace(/&/g, 'and');

    return newShowName;
};

var getShow = function(options, callback) {
    var seasonString = ('0' + options.season).slice(-2),
        episodeString = ('0' + options.episode).slice(-2),
        name = cleanShowName(options.name),
        filters,
        quality = ['hdtv', '720p', '1080p'],
        deferred = Q.defer(),
        minSeeds = 100,
        limit = 5,
        verified = 0;

    options.quality = options.quality.toLowerCase();

    if(options.url) KICKASS_URL = options.url;

    if(options.minSeeds) minSeeds = options.minSeeds;

    if(options.limit) limit = options.limit;

    if(options.verified) verified = 1;

    if (quality.indexOf(options.quality) < 0) {
        //return callback(new Error('Quality not valid'));
        deferred.reject(new Error('Invalid quality value'));
    }

    switch (options.quality) {
        case 'hdtv':
            filters = '-720p -1080p';
            break;
        case '720p':
            filters = '-1080p';
            break;
        case '1080p':
            filters = '-720p';
            break;

    }


    var searchString = name + ' s' + seasonString + 'e' + episodeString + ' ' + options.quality + ' ' + filters + ' seeds:'+ minSeeds+' verified:'+verified+'/?rss=1';

    originalRequest = {
        showName: options.name,
        season: options.season,
        episode: options.episode,
        quality: options.quality,
        limit: options.limit,
        minSeeds: options.minSeeds,
        verified: options.verified
    }

    deferred.resolve(searchString);
    return deferred.promise.nodeify(callback);

}


module.exports = function(options, callback) {
    var deferred = Q.defer();

    var promise = getShow(options);
    promise.then(getSearchRSS)
        .then(parseRSS)
        .then(findBestTorrent)
        .then(function(finalData) {
            deferred.resolve(finalData);
        })
        .
    catch (function(error) {
        deferred.reject(error);
    });
    return deferred.promise.nodeify(callback);
}
