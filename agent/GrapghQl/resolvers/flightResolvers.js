const fs = require('fs').promises;
const xml2js = require('xml2js');
const path = require('path');
//const xmlFilePath = path.resolve('2.xml');
const flightResolvers = {
    Query: {
        flights: async () => {

            try {
                const xmlData = '';//await fs.readFile(xmlFilePath, 'utf8');
                const parser = new xml2js.Parser({
                    trim: true,
                    // normalizeTags: true,
                    customizer: (key, value) => {
                        if (typeof value === 'string') {
                            return value.replace(/[\r\n]+/g, '').trim();
                        }
                        return value;
                    }
                });
                const flights = [];
                const result = await parser.parseStringPromise(xmlData);
                // console.log(result)
                // const jsonData = JSON.stringify(result, null, 2)
                const soapbody = result["SOAP:Envelope"]['SOAP:Body'];
                let LowFareSearchRsp = soapbody[0]['air:LowFareSearchRsp'];
                LowFareSearchRsp = LowFareSearchRsp[0];
                const lowFareAttr = LowFareSearchRsp['$'];
                const LowFareResponseMessage = LowFareSearchRsp['common_v52_0:ResponseMessage'];
                const LowFareFlightDetails = LowFareSearchRsp['air:FlightDetailsList'][0]['air:FlightDetails'];
                const LowFareSegmentDetails = LowFareSearchRsp['air:AirSegmentList'][0]['air:AirSegment'];
                const LowFareFareInfoList = LowFareSearchRsp['air:FareInfoList'][0]["air:FareInfo"];
                const LowFareHostTokenList = LowFareSearchRsp['air:HostTokenList'][0]['common_v52_0:HostToken'];
                const LowFareAPISRequirementsList = LowFareSearchRsp['air:APISRequirementsList'][0]['air:APISRequirements'];
                const LowFareRouteList = LowFareSearchRsp['air:RouteList'][0]['air:Route'];
                const LowFareAirPrisingSolution = LowFareSearchRsp['air:AirPricingSolution'];
                const LowFareRouteListLeg = LowFareRouteList?.[0]?.['air:Leg'];
                const AirLegArr = [];
                if (LowFareRouteListLeg.length > 0) {
                    LowFareRouteListLeg.forEach((val, index) => {
                        AirLegArr.push({
                            Key: val.$.Key,
                            Group: val.$.Group,
                            route: `${val.$.Origin}-${val.$.Destination}`,
                        })
                    });
                }
                const LowFareBrandList = LowFareSearchRsp['air:BrandList'][0]['air:Brand'];
                // return res.send(LowFareResponseMessage);
                let ModifiedFareAndFlights = [];
                await LowFareAirPrisingSolution.forEach((AirPrisingSolution, index) => {
                    if (index == 7 || true) {
                        let AirPricingSol = [];
                        let AirPricingSolutionAttr = AirPrisingSolution['$'];
                        if (AirPricingSolutionAttr['CompleteItinerary'] == 'true') {
                            let AirJourney = AirPrisingSolution['air:Journey'];
                            let AirLegRef = AirPrisingSolution['air:LegRef'];
                            let AirPricingInfo = AirPrisingSolution['air:AirPricingInfo'];
                            let AirConnection = AirPrisingSolution['air:Connection'];
                            let AirFeeInfo = AirPrisingSolution['air:FeeInfo'];
                            let AirTaxInfo = AirPrisingSolution['air:TaxInfo'];
                            let BookingInforArr = [];
                            let HostTokenArry = [];
                            let SegmentAttrKeyAll = '';
                            if (AirJourney.length > 0) {
                                const GroupedSegments = {};
                                AirJourney.forEach((journey, journeyIndex) => {
                                    let AirjourneySegmentRef = journey['air:AirSegmentRef'];
                                    // let AirjourneyAttr = journey['$'];
                                    if (AirjourneySegmentRef.length > 0) {
                                        AirjourneySegmentRef.forEach((AirjourneySegment, AirjourneySegmentIndex) => {
                                            let AirjourneySegmentRefKey = AirjourneySegment['$']['Key'];

                                            // console.log(AirjourneySegmentRefKey);
                                            // console.log(AirBookingInfos);

                                            let AirBookingInfos = AirPricingInfo?.[0]?.['air:BookingInfo'] || [];

                                            let getSingleAirBookinfInfo = AirBookingInfos.find(item => item.$.SegmentRef === AirjourneySegmentRefKey);
                                            const SingleAirBookingInfoAttr = getSingleAirBookinfInfo['$'];
                                            const HostTokenAirBookingInfo = LowFareHostTokenList.find(item => item.$.Key === SingleAirBookingInfoAttr['HostTokenRef']);
                                            const FareInfoAirBookingInfo = LowFareFareInfoList.find(item => item.$.Key === SingleAirBookingInfoAttr['FareInfoRef']);
                                            const FareRuleKeyArr = FareInfoAirBookingInfo['air:FareRuleKey'];
                                            const BrandIdArr = FareInfoAirBookingInfo['air:Brand'];
                                            const BrandDetails = LowFareBrandList.find(item => item.$.BrandID === BrandIdArr[0].$.BrandID);
                                            // const BookingTaxInfo                = AirTaxInfo.find(item=>item.$.Key===SingleAirBookingInfoAttr['TaxInfoRef']);

                                            getSingleAirBookinfInfo['FareInfo'] = FareInfoAirBookingInfo;
                                            getSingleAirBookinfInfo['FareRuleKeyArr'] = FareRuleKeyArr;
                                            getSingleAirBookinfInfo['HostToken'] = HostTokenAirBookingInfo;
                                            getSingleAirBookinfInfo['BrandDetails'] = BrandDetails;
                                            // getSingleAirBookinfInfo['TaxInfo']          = BookingTaxInfo??{};

                                            if (AirBookingInfos.length > 0 && false) {
                                                AirBookingInfos.forEach((AirBookingInfo, AirBookingInfoIndex) => {
                                                    let AirBookingInfoAttr = AirBookingInfo['$'];
                                                    if (AirBookingInfoAttr['SegmentRef'] === AirjourneySegmentRefKey) {
                                                        //getting host token array 
                                                        if (LowFareHostTokenList.length > 0) {
                                                            LowFareHostTokenList.forEach((LowFareHostToken, LowFareHostTokenIndex) => {
                                                                let LowFareHostTokenAttr = LowFareHostToken['$'];
                                                                if (AirBookingInfoAttr['HostTokenRef'] === LowFareHostTokenAttr['Key']) {
                                                                    HostTokenArry.push(LowFareHostToken);
                                                                }
                                                            })
                                                        }
                                                        BookingInforArr.push(AirBookingInfo);
                                                    }
                                                });
                                            }
                                            let FlightDetailsArr = [];
                                            if (LowFareSegmentDetails.length > 0) {
                                                LowFareSegmentDetails.forEach((LowFareSegmentDetail, LowFareSegmentDetailsIndex) => {
                                                    let SegmentAttr = LowFareSegmentDetail['$'];
                                                    if (SegmentAttr['Key'] === AirjourneySegmentRefKey) {
                                                        SegmentAttrKeyAll += SegmentAttr['Key'] + '2024';
                                                        let SegmentCodeShareInfo = LowFareSegmentDetail['air:CodeshareInfo'];
                                                        let SegmentAirAvailInfo = LowFareSegmentDetail['air:AirAvailInfo'];
                                                        let SegmentAirFlightDetailsRef = LowFareSegmentDetail['air:FlightDetailsRef'][0]['$']['Key'];
                                                        let ProviderCode = SegmentAirAvailInfo[0]['$']['ProviderCode'];
                                                        if (LowFareFlightDetails.length > 0) {
                                                            LowFareFlightDetails.forEach((FlightDetail, LowFareFlightDetailsIndex) => {
                                                                let FlightDetailAttr = FlightDetail['$'];
                                                                let FlightDetailKey = FlightDetailAttr['Key'];
                                                                if (FlightDetailKey === SegmentAirFlightDetailsRef) {
                                                                    FlightDetailsArr.push(FlightDetailAttr);
                                                                }
                                                            });
                                                        }
                                                        // LowFareSegmentDetail.APISRequirements   = LowFareAPISRequirementsList.find(item=>item.$.Key===SegmentAttr.APISRequirementsRef);
                                                        // LowFareSegmentDetail.FlightDetail       = FlightDetailsArr;
                                                        LowFareSegmentDetail.BookingInfo = getSingleAirBookinfInfo;
                                                        let groupKey = SegmentAttr['Group'];
                                                        let SegmentIndexKey = AirLegArr.find((item => item.Group === groupKey));
                                                        groupKey = SegmentIndexKey ? SegmentIndexKey['route'] : groupKey;
                                                        if (!GroupedSegments[groupKey]) {
                                                            GroupedSegments[groupKey] = [];
                                                        }
                                                        GroupedSegments[groupKey].push(LowFareSegmentDetail);
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                                // console.log(GroupedSegments)
                                // AirPrisingSolution.segment = SegmentArr
                                AirPrisingSolution.segment = GroupedSegments
                                // AirPrisingSolution.route        = LowFareRouteList
                                // AirPrisingSolution.respMessage  = LowFareResponseMessage
                            }
                            delete AirPrisingSolution['air:Journey'];
                            delete AirPrisingSolution['air:LegRef'];
                            delete AirPrisingSolution['air:Connection'];
                            delete AirPrisingSolution['air:AirPricingInfo'];
                            delete AirPrisingSolution['air:FeeInfo'];
                            delete AirPrisingSolution['air:TaxInfo'];
                            AirPrisingSolution['SegmentAttrKeyAll'] = SegmentAttrKeyAll;
                            flights.push({
                                AirPrisingSolution
                            })
                            ModifiedFareAndFlights.push(AirPrisingSolution);
                        }
                    }
                });
                return flights;
            } catch (error) {
                console.error('Error fetching flight data:', error);
                throw new Error('Unable to fetch flight data');
            }
        },
    },
};

module.exports = flightResolvers;