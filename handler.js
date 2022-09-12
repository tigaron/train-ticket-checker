const got = require('got');
const cheerio = require('cheerio');

const baseUrl = 'https://booking.kai.id/';

function apiResponse (statusCode, body) {
  return {
    'statusCode': statusCode,
    'body': JSON.stringify(body, null, 2),
  };
}

exports.station = async function (event) {
  const { from: origination, to: destination, date: tanggal, adult, infant, class: requestedClass } = event.queryStringParameters || {};

  if (!origination || !destination || !tanggal || !adult || !infant) {
    return apiResponse(400, { message: 'missing required parameter(s)' });
  }

  const submit = 'Cari+%26+Pesan+Tiket';

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
    return apiResponse(404, { message: `No data found for route: ${origination} --> ${destination}` });
  }

  const classRegex = /(Ekonomi|Bisnis|Eksekutif).*/;
  if (requestedClass && classRegex.test(requestedClass)) {
    return apiResponse(200, {
      highlyAvailable: Array.from(highlyAvailable).filter(item => item.trainClass.includes(requestedClass)),
      limitedAvailability: Array.from(limitedAvailability).filter(item => item.trainClass.includes(requestedClass)),
      notAvailable: Array.from(notAvailable).filter(item => item.trainClass.includes(requestedClass)),
    });
  }

  return apiResponse(200, {
    highlyAvailable: Array.from(highlyAvailable),
    limitedAvailability: Array.from(limitedAvailability),
    notAvailable: Array.from(notAvailable),
  });
};

