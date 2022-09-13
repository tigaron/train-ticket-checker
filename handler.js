const got = require('got');
const cheerio = require('cheerio');

const baseUrl = 'https://booking.kai.id/';
const submit = 'Cari+%26+Pesan+Tiket';

const monthRegex = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/;
const classRegex = /Ekonomi|Bisnis|Eksekutif/;

function apiResponse (statusCode, body) {
  return {
    'statusCode': statusCode,
    'headers': { 'Content-Type': 'application/json' },
    'body': JSON.stringify(body, null, 2),
  };
}

const translatedMonth = {
  'jan': 'Januari',
  'feb': 'Februari',
  'mar': 'Maret',
  'apr': 'April',
  'may': 'Mei',
  'jun': 'Juni',
  'jul': 'Juli',
  'aug': 'Agustus',
  'sep': 'September',
  'oct': 'Oktober',
  'nov': 'November',
  'dec': 'Desember'
};

function translateMonth (date) {
  return date.replace(monthRegex, function (matched) {
    return translatedMonth[matched];
  });
}

exports.station = async function (event) {
  try {
    const { from: origination, to: destination, date, adult = 1, infant = 0, class: requestedClass } = event.queryStringParameters || {};
  
    if (!origination || !destination) {
      return apiResponse(400, { message: 'Missing from/to parameter' });
    }
  
    if (!date || !monthRegex.test(date)) {
      return apiResponse(400, { message: 'Missing date parameter or invalid date format' });
    }
  
    const tanggal = translateMonth(date);
  
    const html = await got(baseUrl, {
      searchParams: {
        origination, destination, tanggal, adult, infant, submit
      }
    }).text();
  
    const $ = cheerio.load(html);
  
    const highlyAvailable = new Set();
    const limitedAvailability = new Set();
    const notAvailable = new Set();
  
    $('div.data-wrapper', html).each(function () {
      const tnc = new Set();
      $('div', 'div.col-one', this).each(function () {
        tnc.add($(this).text());
      });
      const [trainName, trainClass] = Array.from(tnc);
    
      const to = new Set();
      to.add($('div.station-start', 'div.col-two', this).text());
      to.add($('div.time-start', 'div.col-two', this).text());
      to.add($('div.date-start', 'div.col-two', this).text());
      const [originStation, originTime, originDate] = Array.from(to);
    
      const td = new Set();
      $('div', 'div.card-arrival', this).each(function () {
        td.add($(this).text());
      });
      const [destinationStation, destinationTime, destinationDate] = Array.from(td);
    
      const more = new Set();
      more.add($('div.long-time', 'div.col-two', this).text());
      more.add($('div.price', 'div.col-four', this).text());
      more.add($('small.sisa-kursi', 'div.col-four', this).text());
      const [travelTime, ticketPrice, availability] = Array.from(more);
    
      const data = {
        trainName,
        trainClass,
        'origin': {
          'station': originStation,
          'date': originDate,
          'time': originTime,
        },
        'destination': {
          'station': destinationStation,
          'date': destinationDate,
          'time': destinationTime,
        },
        travelTime,
        ticketPrice,
        availability,
      }
      if (data.availability === 'Tersedia') highlyAvailable.add(data);
      else if (data.availability === 'Habis') notAvailable.add(data);
      else limitedAvailability.add(data);
    });
  
    if (!highlyAvailable.size || !limitedAvailability.size || !notAvailable.size) {
      return apiResponse(404, { message: `No data found for route from ${origination} to ${destination} on ${date}` });
    }
  
    if (requestedClass && classRegex.test(requestedClass)) {
      const filteredHA = Array.from(highlyAvailable).filter(item => item.trainClass.includes(requestedClass));
      const filteredLA = Array.from(limitedAvailability).filter(item => item.trainClass.includes(requestedClass));
      const filteredNA = Array.from(notAvailable).filter(item => item.trainClass.includes(requestedClass));

      if (!filteredHA.length || !filteredLA.length || !filteredNA.length) {
        return apiResponse(404, { message: `No data found for class ${requestedClass}` });
      }

      return apiResponse(200, {
        highlyAvailable: filteredHA,
        limitedAvailability: filteredLA,
        notAvailable: filteredNA,
      });
    }
  
    return apiResponse(200, {
      highlyAvailable: Array.from(highlyAvailable),
      limitedAvailability: Array.from(limitedAvailability),
      notAvailable: Array.from(notAvailable),
    });
  } catch (error) {
    return apiResponse(500, { message: error.message });
  }
};
