(function() {
    function Courier() {
        var request = require('request')
          , _ = require("underscore")
          , xml2js = require('xml2js')
          , cheerio = require('cheerio')
          , moment = require('moment')
          , countries = require('iso-countries');

        this.usps = function(tracking_number, callback) {
            var tracking_result = {}; // save your result to this object
            var uspsAPIKey = "774NA0005227";
            var uspsUrl = "http://production.shippingapis.com/ShippingAPITest.dll" +
              '?API=TrackV2&XML=<TrackFieldRequest USERID="'+ uspsAPIKey +'"><TrackID ID="'+ tracking_number +'"></TrackID></TrackFieldRequest>';
            var usupCheckpoints = [];

            // Make request to USPS webservice
            request(uspsUrl, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    // USPS API responses in XML
                    var parser = new xml2js.Parser();
                    parser.parseString(body, function(err, result) {
                    if (!result.TrackResponse.TrackInfo[0].TrackSummary) {
                        callback("Error");
                    }

                    for(var i = 0; i < result.TrackResponse.TrackInfo[0].TrackSummary.length; i++) {
                        uspsResult = result.TrackResponse.TrackInfo[0].TrackSummary[i];
                            usupCheckpoints.push({
                                country_name: uspsResult.EventCountry[0],
                                message: uspsResult.Event[0],
                                checkpoint_time: parseDatetime(uspsResult.EventDate[0] + " " + uspsResult.EventTime[0])
                            });
                        }
                    });

                    addItemsToResults(tracking_result, "checkpoints", usupCheckpoints);
                    callback(tracking_result);
                }
            });
        };

        this.hkpost = function(tracking_number, callback) {
            var tracking_result = {}; // save your result to this object
            var hkpostUrl = "http://app3.hongkongpost.hk/CGI/mt/e_detail2.jsp?mail_type=parcel_ouw&tracknbr=" + tracking_number + "&localno=" + tracking_number;
            var hkpostCheckpoints = [];

            // Make request to Hong Kong Post
            request(hkpostUrl, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    // HKPOST responses in HTML
                    $ = cheerio.load(body);
                    _.each($($('table.detail')[1]).children(), function(row){
                        var cols = $(row).children('td');
                        if (cols.length) {
                            hkpostCheckpoints.push({
                                country_name: parseCountryCode($(cols[1]).html()),
                                message: $(cols[2]).html(),
                                checkpoint_time: parseDatetime($(cols[0]).html())
                            });
                        }
                    });

                    addItemsToResults(tracking_result, "checkpoints", hkpostCheckpoints);
                    callback(tracking_result);
                }
            });
        };

        this.dpduk = function(tracking_number, callback) {
            var tracking_result = {}; // save your result to this object
            var dpdHost = "http://www.dpd.co.uk";
            var dpdSearchRequestUrl = dpdHost + "/esgServer/shipping/shipment/_/parcel/?filter=id&searchCriteria=deliveryReference%3D" + tracking_number;
            var dpdUrl = dpdHost + "/esgServer/shipping/delivery/?parcelCode=" + tracking_number;
            var dpdCheckpoints = [];

            /**
             * Make request to DPD
             * Get the search session from first request, do the actual tracking job in second request using the search session
             */
            request(dpdSearchRequestUrl, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var jsonResponse = JSON.parse(body);

                    if (!jsonResponse.obj || !jsonResponse.obj.searchSession) {
                        callback("Error");
                    }

                    // set cookies for authorization
                    var options = {
                        url: dpdUrl,
                        headers: {
                            'Cookie': 'tracking=' + jsonResponse.obj.searchSession
                        }
                    };

                    request(options, function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            var resultJSON = JSON.parse(body);

                            if (!resultJSON.obj || !resultJSON.obj.trackingEvent) {
                                callback("Error");
                            }

                            // DPD responses in reverse order
                            var trackingEvents = resultJSON.obj.trackingEvent.reverse();

                            _.each(trackingEvents, function(event){
                                // strip the timezone because we want the utc time string for this test
                                var time = event.trackingEventDate;
                                if (time) {
                                    time = time.replace(/\.\d+Z$/g, "");
                                }

                                dpdCheckpoints.push({
                                    country_name: event.trackingEventLocation,
                                    message: event.trackingEventStatus,
                                    checkpoint_time: time
                                });
                            });

                            addItemsToResults(tracking_result, "checkpoints", dpdCheckpoints);
                            callback(tracking_result);
                        }
                    });
                }
            });
        };

        function parseCountryCode(countryName) {
            var country = countries.findCountryByName(countryName);
            return country? country.value : '';
        }

        function parseDatetime(datetime) {
            var datetimeObject = moment(datetime);
            if (!datetimeObject.isValid()){
                return '';
            }
            return datetimeObject.format("YYYY-MM-DDTHH:mm:ss");
        }

        function addItemsToResults(result, name, items) {
            result[name] = items;
        }
    }

    module.exports = new Courier();
}());

