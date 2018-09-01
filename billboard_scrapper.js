const request = require('request');
const cheerio = require('cheerio');
const Promise = require('bluebird');
const _ = require('lodash');

const URLS = {
    base: (uri) => `https://www.billboard.com${uri}`,
    bill_board_archive_dates: 'https://www.billboard.com/archive/charts/1958',
};

// Takes an URL and returns a Cheerio object that can be used to parse the HTML body
async function cheerio_get(url){
    const { response, body } = await Promise.fromCallback((cb) => {
        request(url, (err, res, body) => cb(null, res, body));
    });
    if (!body) throw new Error('Invalid res from billboard archives site');
    return cheerio.load(body);
}

// Gets a list of years that we can access and returns the URIs of each year
async function get_bill_board_archive_years() {
    const $ = await cheerio_get(URLS.bill_board_archive_dates);
    return $('.year-list__decade__dropdown__item').map((index, element) => {
        const year = $(element).text().trim();
        const url = $(element).find('a').attr('href').trim();
        return {
            year,
            archive_uri: URLS.base(url)
        }
    }).toArray();
}

// For each year, there's multiple publishes of the top 100 billboard - this method will get a list for a certain year
// With the year being a { year, archive_uri } object - see get_bill_board_archive_years
async function get_bill_board_archive_hot_100_dates(years){
    return Promise.map(years, async (yr) => {
        const $ = await cheerio_get(`${yr.archive_uri}/hot-100`);

        return _.flatten($('.archive-table tbody tr td a').map((index, element) => {
            return URLS.base($(element).attr('href').trim())
        }).toArray());
    });
}
// Gets the billboard top 100 for a certain date by passing in the uri
// e.g https://www.billboard.com/charts/hot-100/1958-08-04
async function get_top_100(date_uri){
    const $ = await cheerio_get(date_uri);

    // Top 1 is place differently from other 99
    const number_one_song = $('.chart-number-one__title').text().trim();
    const number_one_artist = $('.chart-number-one__artist').text().trim();
    let top_100 = [{song:number_one_song, artist:number_one_artist, rank: '1'}];

    top_100 = top_100.concat($('.chart-list-item').map((index, element) => {
        const song = $(element).attr('data-title').trim();
        const artist = $(element).attr('data-artist').trim();
        const rank = $(element).attr('data-rank').trim();
        if (!song || !artist || !rank) throw new Error('Invalid Song encountered');
        return { song, artist, rank }
    }).toArray());

    if (top_100.length !== 100) throw new Error('Number of songs doesn\'t seem to add up');
    return top_100;
}

// Example of how methods can be used.
// Be careful if running for all dates - froze my computer multiple times
// Avoid crashing by using .each instead of .map - sacrificing performance
async function main(){
    const years = await get_bill_board_archive_years();
    if (!years) throw new Error('No archive found, please check the url');
    const archive_dates = await get_bill_board_archive_hot_100_dates(years);
    await Promise.map(archive_dates, async (date) => {
        return get_top_100(date)
    });
}
