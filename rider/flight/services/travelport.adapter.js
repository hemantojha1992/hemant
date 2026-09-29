const { getFlighstSearchRequest, getFlighstSearchRequest_GDSACC, getFlighstSearchRequest_Premium, getFlighstSearchRequest_Business, getFlighstAirPriceRequest, getFlighstRePriceRequest,
    getFlightCreateReservationRequest,
    RetrieveReservationRequest,
    getFlighstOptionalServicesRequest, TicketingRequest, HoldToConfirmRequest,RefundQuoteRequest,flightRefundRequest,cancelFlightTicketRetriveData
} = require('./travelport.request');
const { processRequest } = require('./travelport.client');
const { setCacheData, getCacheData } = require("../../../shared/redis/Redis");
const xml2js = require('xml2js');
const FlightModel = require('../models/flight.model');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class TravelportAdapter {
    
    static tdsApplicable = true;
    static tdsPVal = 2;
    static fuel_charge = 50;
    static fuel_charge = 50;
    static secretKey = crypto.createHash('sha256').update('my_super_secret_password').digest();

    static manageMentFeeApplicable = true;
    static manageMentFee = 15;
    static manageMentFeeTax = 2.7;

    encrypt(obj) {
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv(
            'aes-256-cbc',
            TravelportAdapter.secretKey,
            iv
        );

        const encrypted = Buffer.concat([
            cipher.update(JSON.stringify(obj), 'utf8'),
            cipher.final()
        ]);

        return Buffer.concat([iv, encrypted]).toString('base64');
    }

    decrypt(encryptedStr) {
        const raw = Buffer.from(encryptedStr, 'base64');

        const iv = raw.slice(0, 16);
        const content = raw.slice(16);

        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            TravelportAdapter.secretKey,
            iv
        );

        const decrypted = Buffer.concat([
            decipher.update(content),
            decipher.final()
        ]);

        return JSON.parse(decrypted.toString('utf8'));
    }


    async GetFlightListWithSSE(searchData, onData) {
        const app_reference = await getCacheData('app_reference');

        const gdsSearchData = { ...searchData, accountCodes: ["SME"], provider: '1G' };
        const requests = [
            // { name: "ACH", xml: await getFlighstSearchRequest(searchData) },
            { name: "GDS", xml: await getFlighstSearchRequest(gdsSearchData) },
            { name: "GDSACC", xml: await getFlighstSearchRequest_GDSACC(gdsSearchData) },
            { name: "Premium", xml: await getFlighstSearchRequest_Premium(gdsSearchData) },
            { name: "Business", xml: await getFlighstSearchRequest_Business(gdsSearchData) }
        ];

        const finalResults = [];

        const handleRequest = async (req) => {
            try {
                const xmlResponse = await processRequest(req.xml);
                await FlightModel.flight_xml_log(app_reference, req.xml, xmlResponse, `Travelport Search ${req.name} NODE`);

                const jsonData = await xml2js.parseStringPromise(xmlResponse, { explicitArray: false }).catch(() => null);
                if (jsonData) {
                    const flights = await this.mapToUnifiedFormat(jsonData, req.xml, searchData);
                    if (flights?.length) {
                        finalResults.push(...flights);
                        // Send SSE immediately
                        onData({ provider: req.name, flights, cumulativeData: [...finalResults] });
                    }
                }
            } catch (err) {
                console.error(`Error processing ${req.name}:`, err.message);
            }
        };

        // map to promises and await them all (controller will stay open until all done)
        const promises = requests.map(req => handleRequest(req));
        await Promise.all(promises);
    }
    async mapToUnifiedFormat(response, request, searchData) {
        const tripType = (searchData.return && searchData.return.trim() !== "") ? "RoundTrip" : "Oneway";
        const body = response?.['SOAP:Envelope']?.['SOAP:Body'] || {};
        const rsp = body?.['air:LowFareSearchRsp'] || {};
        const solutions = rsp['air:AirPricingSolution'];
        if (!solutions) return [];
        const parser = new xml2js.Parser({ explicitArray: false });

        const priceIdArr = {};
        parser.parseString(request, (err, result) => {
            const passenger = result?.['soapenv:Envelope']?.['soapenv:Body']?.['air:LowFareSearchReq']?.['common:SearchPassenger'] || {};
            priceIdArr['passenger'] = passenger;
        });

        priceIdArr['solutions'] = solutions;

        // const parser = new xml2js.Parser({ explicitArray: false });
        // const priceIdArr = {};
        parser.parseString(request, (err, result) => {
            const passenger = result?.['soapenv:Envelope']?.['soapenv:Body']?.['air:LowFareSearchReq']?.['common:SearchPassenger'] || {};
            priceIdArr['passenger'] = passenger;
        });
        priceIdArr['solutions'] = solutions;

        // const AdminDistMarkupAll = await FlightModel.getAdminDistMarkup_New();
        // const PLBDATA_All = await FlightModel.getPLBData_New();
        // const agent_markup = await FlightModel.get_agent_markup(process.env.STATIC_USER_ID);
        // await setCacheData('GET_PLBDATA_All', PLBDATA_All, 604800);
        // await setCacheData('GET_ADMIN_DIST_MARKUP', AdminDistMarkupAll, 604800);
        // await setCacheData('GET_AGENT_MARKUP', agent_markup, 604800);

        const [AdminDistMarkupAll, PLBDATA_All, agent_markup] = await Promise.all([
            FlightModel.getAdminDistMarkup_New(),
            FlightModel.getPLBData_New(),
            FlightModel.get_agent_markup(process.env.STATIC_USER_ID)
        ]);

        await Promise.all([
            setCacheData('GET_ADMIN_DIST_MARKUP', AdminDistMarkupAll, 604800),
            setCacheData('GET_PLBDATA_All', PLBDATA_All, 604800),
            setCacheData('GET_AGENT_MARKUP', agent_markup, 604800)
        ]);



        const segmentList = this.makeMap(rsp?.['air:AirSegmentList']?.['air:AirSegment']);
        const fareInfoList = this.makeMap(rsp?.['air:FareInfoList']?.['air:FareInfo']);
        const hostTokenList = this.makeMap(rsp?.['air:HostTokenList']?.['common_v52_0:HostToken']);
        const BrandList = rsp?.['air:BrandList'] || {};
        const toArray = val => Array.isArray(val) ? val : [val];
        const grouped = {};
        let srn = 1;

        for (const solution of toArray(solutions)) {
            const segmentRefs = toArray(solution?.['air:Journey']?.['air:AirSegmentRef']);
            const segmentKeys = segmentRefs.map(ref => ref?.['$']?.Key);
            const segments = segmentKeys.map(k => segmentList[k] ? JSON.parse(JSON.stringify(segmentList[k])) : null).filter(Boolean);

            //const uniqueFlightKey = segments.map(seg => `${seg.$.Carrier}-${seg.$.FlightNumber}-${seg.$.Origin}-${seg.$.Destination}-${seg.$.DepartureTime}-${seg.$.ArrivalTime}`).join("|");
            const uniqueFlightKey = segments.map(seg => seg?.$ ? `${seg.$.Carrier}-${seg.$.FlightNumber}-${seg.$.Origin}-${seg.$.Destination}-${seg.$.DepartureTime}-${seg.$.ArrivalTime}` : "INVALID").join("|");

            const pricingInfos = toArray(solution?.['air:AirPricingInfo']);
            const fares = [];
            const pax_price_details = {};
            const Journey = solution?.['air:Journey'] || {};
            for (const p of pricingInfos) {
                const fareRefs = toArray(p?.['air:FareInfoRef']);
                const bookings = toArray(p?.['air:BookingInfo']);

                const platingCarrier = p?.['$']?.PlatingCarrier || "";

                for (let i = 0; i < fareRefs.length; i++) {
                    const fareRefKey = fareRefs[i]?.['$']?.Key;
                    if (!fareRefKey) continue;
                    const fareInfo = fareInfoList[fareRefKey]?.['$'] || {};
                    const booking = bookings[i]?.['$'] || {};
                    const hostToken = hostTokenList[booking?.HostTokenRef];
                    const singleToken = hostToken?.['$']?.Key || "";

                    //const singleBrandID  = toArray(fareInfoList[fareRefKey]['air:Brand'])[0]?.['$']?.BrandID || {};
                    const singleBrandID = toArray(fareInfoList[fareRefKey]?.['air:Brand'])?.[0]?.['$']?.BrandID || "";
                    const providerCode = toArray(fareInfoList[fareRefKey]?.['air:FareRuleKey'])?.[0]?.['$']?.ProviderCode || "";

                    let group_type = "";
                    if (providerCode === "ACH") {
                        group_type = "LCC";
                    } else {
                        group_type = platingCarrier || "GDS";
                    }


                    let onegFareFamily = '';
                    if (!singleBrandID) {
                        onegFareFamily = 'Published';
                    } else {
                        const familyNameList = BrandList["air:Brand"].find(b => b.$.BrandID === singleBrandID);
                        onegFareFamily = familyNameList.$.Name;
                    }
                    segments.forEach(segment => {
                        if (segment.$.Key === booking?.SegmentRef) {
                            segment.$.HostTokenRef = singleToken;
                        }
                    });

                    priceIdArr['fareInfo'] = fareInfo;
                    priceIdArr['segments'] = segments;
                    priceIdArr['hostToken'] = hostToken;
                    priceIdArr['journey'] = Journey;
                    priceIdArr['TotalPrice'] = (p?.['$']?.TotalPrice || '').replace('INR', '');
                    priceIdArr['BasePrice'] = (p?.['$']?.BasePrice || '').replace('INR', '');
                    const priceKey = `flightprice_${srn}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
                    const priceId = await setCacheData(priceKey, priceIdArr, 604800);
                    const priceIdEnc = Buffer.from(priceKey).toString('base64');

                    const fareObj = {
                        TotalPrice: (p?.['$']?.TotalPrice || "").replace("INR", ""),
                        BasePrice: (p?.['$']?.BasePrice || "").replace("INR", ""),
                        Taxes: (p?.['$']?.Taxes || "").replace("INR", ""),
                        Fees: (p?.['$']?.Fees || "0").replace("INR", ""),
                        Services: 0,
                        ShowingFare: 0,
                        NetFare: 0,
                        PassengerTypeCode: fareInfo?.PassengerTypeCode || "",
                        FareFamily: fareInfo?.FareFamily || onegFareFamily,
                        FareBasis: fareInfo?.FareBasis || "",
                        BookingCode: booking?.BookingCode || "",
                        BookingCount: booking?.BookingCount || "",
                        CabinClass: booking?.CabinClass || "",
                        Refundable: "Yes",
                        //PriceId: Buffer.from(`flightprice_id_${srn}`).toString("base64")
                        PriceId: priceIdEnc
                    };


                    const fareCalc = await this.getCalculateFare({
                        providerCode,
                        baseFare: Number(fareObj.BasePrice),
                        grossFare: Number(fareObj.TotalPrice),
                        fee: Number(fareObj.Fees || 0),
                        services: fareObj.Services,
                        fareFamily: fareObj.FareFamily,
                        paxCount: Number(fareObj.BookingCount || 1),
                        groupType: group_type
                    });

                    fareObj.ShowingFare = fareCalc.ShowingFare + agent_markup.value;
                    fareObj.NetFare = fareCalc.NetFare;
                    fareObj.TaxNmrkp = fareCalc.TaxNmrkp;
                    fareObj.AgentMarkup = agent_markup.value;
                    fareObj.calcu = fareCalc;


                    fares.push(fareObj);
                    const paxType = fareObj.PassengerTypeCode;
                    if (!pax_price_details[paxType]) pax_price_details[paxType] = [];
                    if (!pax_price_details[paxType].some(f => f.FareFamily === fareObj.FareFamily && f.TotalPrice === fareObj.TotalPrice)) {
                        const paxCopy = { ...fareObj };
                        delete paxCopy.PriceId;
                        delete paxCopy.BookingCode;
                        delete paxCopy.BookingCount;
                        delete paxCopy.CabinClass;
                        delete paxCopy.FareBasis;
                        pax_price_details[paxType].push(paxCopy);
                    }
                    srn++;
                }
            }
            if (!grouped[uniqueFlightKey]) {
                grouped[uniqueFlightKey] = {
                    segments: segments.map(seg => ({
                        airline: seg.$.Carrier,
                        flight_number: seg.$.FlightNumber,
                        from: seg.$.Origin,
                        to: seg.$.Destination,
                        departure: seg.$.DepartureTime,
                        arrival: seg.$.ArrivalTime,
                        tripType: tripType
                    })),
                    fares: [],
                    pax_price_details: {},
                    uniqueFlightKey
                };
            }
            fares.forEach(f => {
                if (!grouped[uniqueFlightKey].fares.some(existing => existing.FareBasis === f.FareBasis && existing.TotalPrice === f.TotalPrice)) {
                    grouped[uniqueFlightKey].fares.push(f);
                }
            });
            Object.keys(pax_price_details).forEach(pt => {
                if (!grouped[uniqueFlightKey].pax_price_details[pt]) grouped[uniqueFlightKey].pax_price_details[pt] = [];
                pax_price_details[pt].forEach(f => {
                    if (!grouped[uniqueFlightKey].pax_price_details[pt].some(existing => existing.FareFamily === f.FareFamily && existing.TotalPrice === f.TotalPrice)) {
                        grouped[uniqueFlightKey].pax_price_details[pt].push(f);
                    }
                });
            });
        }
        return Object.values(grouped);
    }
    removeDollarFields(obj, removeKeys = []) {
        if (!obj || typeof obj !== 'object' || !obj.$) return {};
        const result = { ...obj.$ };
        if (Array.isArray(removeKeys) && removeKeys.length > 0) {
            for (const key of removeKeys) {
                delete result[key];
            }
        }
        return result;
    }
    keepDollarFields(obj, keepKeys = [],airportCacheList='',airlineCacheList='') {
        if (!obj || typeof obj !== 'object' || !obj.$) return {};
        if (!Array.isArray(keepKeys) || keepKeys.length === 0) return {};
        const result = {};
        for (const key of keepKeys) {
            if (key in obj.$) {
                result[key] = obj.$[key];
            }else if(key == 'OriginAirPortName'){
                let originKey = obj.$.Origin;
                result[key] = (airportCacheList) ? airportCacheList[originKey].airport_name || '' : '';
            }else if(key == 'DestinationAirPortName'){
                let destinationKey = obj.$.Destination;
                result[key] = (airportCacheList) ? airportCacheList[destinationKey].airport_name || '' : '';
            }else if(key == 'OriginCity'){
                let destinationKey = obj.$.Origin;
                result[key] = (airportCacheList) ? airportCacheList[destinationKey].airport_city || '' : '';
            }else if(key == 'DestinationCity'){
                let destinationKey = obj.$.Destination;
                result[key] = (airportCacheList) ? airportCacheList[destinationKey].airport_city || '' : '';
            }else if(key == 'AirLineName'){
                let CarrierKey = obj.$.Carrier;
                result[key] = (airlineCacheList) ? airlineCacheList[CarrierKey].name || '' : '';
            }
        }
        return result;
    }
    getUnifiedPrice(keys, APIAttr = {}) {
        for (const k of keys) {
            if (APIAttr?.$?.[k] != null && APIAttr?.$?.[k] != undefined && APIAttr?.$?.[k] != 'undefined') {
                if (APIAttr?.$?.[k] != undefined) {
                    const value = String(APIAttr?.$?.[k]).replace(/[^0-9.]/g, '');
                    return parseFloat(value) || 0;
                } else {
                    return 0;
                }
            }
        }
    }

    makeMap(list, type = 'ach') {
        const items = Array.isArray(list) ? list : [list];
        const map = {};
        for (const item of items) {
            let key;
            if (type != 'ach') {
                key = item?.['$']?.BrandID;
            } else {
                key = item?.['$']?.Key;

            }
            if (key) map[key] = item;
        }
        return map;
    }

    groupSegments(segments) {
        // Combine segments with same origin/destination/time into groups
        const groups = {};
        for (const seg of segments) {
            const key = [
                seg?.['$']?.Origin,
                seg?.['$']?.Destination,
                seg?.['$']?.DepartureTime,
                seg?.['$']?.ArrivalTime
            ].join('|');
            if (!groups[key]) groups[key] = [];
            groups[key].push({
                airline: seg?.['$']?.Carrier,
                flight_number: seg?.['$']?.FlightNumber,
                from: seg?.['$']?.Origin,
                to: seg?.['$']?.Destination,
                departure: seg?.['$']?.DepartureTime,
                arrival: seg?.['$']?.ArrivalTime
            });
        }

        return Object.values(groups);
    }
    async GetFlightList(searchData) {
        const user_id = searchData.user_id;
        const app_reference = searchData.app_reference;
        const gdsSearchData = { ...searchData, accountCodes: ["SME"], provider: '1G' };

        const requests = [
            { name: "ach", xml: await getFlighstSearchRequest(searchData) },
            { name: "1g_gds", xml: await getFlighstSearchRequest(gdsSearchData) },
            { name: "1g_premium", xml: await getFlighstSearchRequest_Premium(gdsSearchData) },
            { name: "1g_sme", xml: await getFlighstSearchRequest_GDSACC(gdsSearchData) },
            { name: "1g_business", xml: await getFlighstSearchRequest_Business(gdsSearchData) }
        ];
        const [AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP] = await Promise.all([
            FlightModel.getAdminDistMarkup_New(user_id),
            FlightModel.getPLBData_New(user_id),
            FlightModel.get_agent_markup(user_id)
        ]);
        
        const finalResults = {};
        const handleRequest = async (req) => {
            try {
                const xmlResponse = await processRequest(req.xml);
                await FlightModel.flight_xml_log(app_reference, req.xml, xmlResponse, `${req.name}`,user_id);
                const jsonData = await xml2js.parseStringPromise(xmlResponse, { explicitArray: false }).catch(() => null);
                if (jsonData) {
                    const body = jsonData?.['SOAP:Envelope']?.['SOAP:Body'] || {};
                    const fault = body?.['SOAP:Fault'];
                    if (fault) { 
                        throw new Error('Flight list not found!');
                    }
                    
                    const flights = await this.manageFlightList(jsonData, req.xml, searchData, app_reference, AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP);
                    
                    for (const [uniqueKey, fareArr] of Object.entries(flights)) {
                        if (!finalResults[uniqueKey]) {
                            finalResults[uniqueKey] = [];
                        }

                        // for (const newFlight of fareArr) {
                        //     const nd = newFlight.fareDetail || {};
                        //     const isDuplicate = finalResults[uniqueKey].some(existing => {
                        //         const ed = existing.fareDetail || {};
                        //         return (
                        //             ed.fareFamily === nd.fareFamily &&
                        //             ed.totalprice === nd.totalprice &&
                        //             ed.providerCode === nd.providerCode &&
                        //             ed.fareBasis === nd.fareBasis
                        //         );
                        //     });
                        //     if (!isDuplicate) {
                        //         finalResults[uniqueKey].push(newFlight);
                        //     }
                        // }
                        for (const newFlight of fareArr) {
                            const nd = newFlight.fareDetail || {};

                            const existingIndex = finalResults[uniqueKey].findIndex(existing => {
                                const ed = existing.fareDetail || {};

                                return (
                                    ed.fareFamily === nd.fareFamily &&
                                    ed.providerCode === nd.providerCode
                                );
                            });

                            if (existingIndex === -1) {
                                // First occurrence
                                finalResults[uniqueKey].push(newFlight);
                            } else {
                                // Keep only the lower priced flight
                                const existingPrice = parseFloat(
                                    (finalResults[uniqueKey][existingIndex].fareDetail?.totalprice || "0").toString().replace(/[^0-9.]/g, "")
                                );

                                const newPrice = parseFloat(
                                    (nd.totalprice || "0").toString().replace(/[^0-9.]/g, "")
                                );

                                if (newPrice < existingPrice) {
                                    finalResults[uniqueKey][existingIndex] = newFlight;
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`Error processing ${req.name}:`, err.message);
            }
        };

        const promises = requests.map(req => handleRequest(req));
        await Promise.all(promises);

        if (finalResults.length === 0) {
            return {
                status: 0,
                message: "No flight found"
            };
        }

        return {
            status: 1,
            message: "Success",
            data: finalResults
        };
    }

    async manageFlightList(response, request, searchData, app_reference, AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP) {
        let managementFee = 0;
        let managementFeeTax = 0;
        let totalmanagementFees = 0;
        if (TravelportAdapter.manageMentFeeApplicable) {
            managementFee = TravelportAdapter.manageMentFee;
            managementFeeTax = TravelportAdapter.manageMentFeeTax;
            totalmanagementFees = managementFee + managementFeeTax;
        }
        const totalPax = Number(searchData.adult || 0) + Number(searchData.child || 0) + Number(searchData.infant || 0);
        const user_id = searchData.user_id || null;
        const onwardKey = `${searchData.from} - ${searchData.to}`;
        const returnKey = `${searchData.to} - ${searchData.from}`;

        const toArray = (v) => Array.isArray(v) ? v : [v];
        const body = response?.['SOAP:Envelope']?.['SOAP:Body'] || {};
        const rsp = body?.['air:LowFareSearchRsp'] || {};

        const APSArr = toArray(rsp['air:AirPricingSolution']);
        const RouteListArr = toArray(rsp?.['air:RouteList']?.['air:Route']);
        const APISRequirementsListArr = this.makeMap(rsp?.['air:APISRequirementsList']?.['air:APISRequirements']);
        const HostTokenListArr = this.makeMap(rsp?.['air:HostTokenList']?.['common_v52_0:HostToken']);
        const FareInfoListArr = this.makeMap(rsp?.['air:FareInfoList']?.['air:FareInfo']);
        const AirSegmentListArr = this.makeMap(rsp?.['air:AirSegmentList']?.['air:AirSegment']);
        const FlightDetailsListArr = this.makeMap(rsp?.['air:FlightDetailsList']?.['air:FlightDetails']);
        const BrandListArr = this.makeMap(rsp?.['air:BrandList']?.['air:Brand'], '1g');

        const routeList = {};
        for (const routes of RouteListArr) {
            for (const route of toArray(routes['air:Leg'])) {
                const group = route?.$?.Group || '';
                const origin = route?.$?.Origin || '';
                const destination = route?.$?.Destination || '';
                routeList[group] = `${origin} - ${destination}`;
            }
        }
        
        if (!APSArr) return [];
        let airportCacheList = await getCacheData('all_airport_list_raw');
        let airlineCacheList = await getCacheData('all_airline_list_raw');

        const finalFlightDetail = [];
        for (const apSolution of APSArr) {
            let uniqueFlightKey = "";
            const priceIdArr = { searchData: searchData, APSref: '', app_ref: '', fareFamily: '', providerCode: '', cabinClass: '' };
            priceIdArr.APSref = apSolution?.$?.Key || '';
            priceIdArr.app_ref = app_reference || '';
            //const priceIdArr = {};
            const flightObj = {
                segment: { onward: [] },
                flightDetail: { onward: [] },
                paxFare: [],
                fareDetail: {},
                priceId: ""
            };

            const apsAttr = apSolution?.$;
            if (apsAttr?.CompleteItinerary === 'true' || !apsAttr.CompleteItinerary) {
                let fareDetailsWithOutCal = {
                    providerCode: '',
                    fareFamily: '',
                    fareBasis: '',
                    totalprice: this.getUnifiedPrice(['EquivalentTotalPrice', 'ApproximateTotalPrice', 'TotalPrice'], apSolution),
                    baseprice: this.getUnifiedPrice(['EquivalentBasePrice', 'ApproximateBasePrice', 'BasePrice'], apSolution),
                    taxes: this.getUnifiedPrice(['EquivalentTaxes', 'ApproximateTaxes', 'Taxes'], apSolution),
                    fees: this.getUnifiedPrice(['EquivalentFees', 'ApproximateFees', 'Fees'], apSolution),
                    services: this.getUnifiedPrice(['EquivalentServices', 'ApproximateServices', 'Services'], apSolution),

                };

                const paxPriceDetails = {};
                const bookingInfoDetail = {};
                for (const pInfo of toArray(apSolution['air:AirPricingInfo'])) {
                    const ff = toArray(pInfo?.['air:FareInfoRef'])?.[0]?.['$']?.Key || '';
                    const BrandID = toArray(FareInfoListArr[ff]['air:Brand'])?.[0]?.$?.BrandID || [];
                    const providerCode = pInfo?.$?.ProviderCode || "";

                    let fareFamily = '';
                    if (providerCode?.toLowerCase() == '1g') {
                        fareFamily = BrandListArr[BrandID]?.$?.Name || "Published";
                    } else {
                        fareFamily = FareInfoListArr[ff]?.$?.FareFamily || BrandListArr[pInfo?.['air:BrandRef']?.[0]?.$?.BrandID]?.$?.Name || "Published";
                    }
                    const fareBasis = FareInfoListArr[ff]?.$?.FareBasis || BrandListArr[pInfo?.['air:BrandRef']?.[0]?.$?.BrandID]?.$?.Name || "Published";
                    flightObj.fareDetail.fareFamily = fareFamily;
                    flightObj.fareDetail.fareBasis = fareBasis;
                    fareDetailsWithOutCal.fareFamily = fareFamily || '';
                    fareDetailsWithOutCal.fareBasis = fareBasis || '';

                    const platingCarrier = pInfo?.$?.platingCarrier || "";
                    let group_type = "";
                    if (providerCode === "ACH") {
                        group_type = "LCC";
                    } else {
                        group_type = platingCarrier || "GDS";
                    }

                    for (const passType of toArray(pInfo?.['air:PassengerType'])) {
                        let PaxTypeCode = passType?.$?.Code;
                        PaxTypeCode = (PaxTypeCode === 'CNN') ? 'CHD' : PaxTypeCode;
                        let paxCount = 1;
                        if (PaxTypeCode === 'ADT') {
                            paxCount = searchData.adult;
                        } else if (PaxTypeCode === 'CHD' || PaxTypeCode === 'CNN') {
                            paxCount = searchData.child;
                        } else if (PaxTypeCode === 'INF') {
                            paxCount = searchData.infant;
                        }
                        const paxPriceWithOutCal = {
                            totalprice: this.getUnifiedPrice(['EquivalentTotalPrice', 'ApproximateTotalPrice', 'TotalPrice'], pInfo),
                            baseprice: this.getUnifiedPrice(['EquivalentBasePrice', 'ApproximateBasePrice', 'BasePrice'], pInfo),
                            taxes: this.getUnifiedPrice(['EquivalentTaxes', 'ApproximateTaxes', 'Taxes'], pInfo),
                            fees: this.getUnifiedPrice(['EquivalentFees', 'ApproximateFees', 'Fees'], pInfo),
                            services: this.getUnifiedPrice(['EquivalentServices', 'ApproximateServices', 'Services'], pInfo),
                            paxCount: parseFloat(paxCount),
                        }
                        const isReturn = searchData?.return || false;
                        const commission = await this.getCommisionCalF(providerCode, paxPriceWithOutCal.baseprice, paxPriceWithOutCal.totalprice, paxPriceWithOutCal.fees, fareFamily, paxPriceWithOutCal.services, 1, group_type, user_id, false, false, AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP, isReturn)

                        paxPriceWithOutCal.commission = commission;
                        paxPriceDetails[PaxTypeCode] = paxPriceWithOutCal;
                    }
                    let pIdHostToken = [];
                    let pIdfareInfo = [];
                    for (const bookingInfoType of toArray(pInfo?.['air:BookingInfo'])) {
                        const BookingSegmentRef = bookingInfoType?.$?.SegmentRef;
                        bookingInfoDetail[BookingSegmentRef] = bookingInfoType?.$ || {};

                        const BookingSHostTokenRef = bookingInfoType?.$?.HostTokenRef;
                        let singleHostToken = HostTokenListArr[BookingSHostTokenRef];
                        pIdHostToken.push(singleHostToken);

                        const BookingSFareInfoRef = bookingInfoType?.$?.FareInfoRef;
                        let singleFareInfo = FareInfoListArr[BookingSFareInfoRef];
                        if (singleFareInfo?.$?.FareBasis) {
                            pIdfareInfo.push({
                                AirSegmentRef: BookingSegmentRef,
                                FareBasisCode: singleFareInfo.$.FareBasis
                            });
                        }

                    }

                    priceIdArr.providerCode = providerCode || '';
                    priceIdArr.fareFamily = fareFamily || '';
                    fareDetailsWithOutCal.fareFamily = fareFamily || '';
                    fareDetailsWithOutCal.providerCode = providerCode || '';
                    const commission = await this.getCommisionCalF(providerCode, fareDetailsWithOutCal.baseprice, fareDetailsWithOutCal.totalprice, fareDetailsWithOutCal.fees, fareFamily, fareDetailsWithOutCal.services, totalPax, group_type, user_id, true, false, AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP)
                    fareDetailsWithOutCal = {
                        ...fareDetailsWithOutCal,
                        ...commission
                    };

                }
                flightObj.paxFare = Object.entries(paxPriceDetails).map(([paxType, price]) => ({ paxType, ...price }));

                for (const jrny of toArray(apSolution['air:Journey'])) {
                    let pIdSegments = [];

                    for (const item of toArray(jrny['air:AirSegmentRef'])) {
                        const segKey = item.$.Key;
                        const segDetail = AirSegmentListArr?.[segKey] || {};
                        pIdSegments.push(segDetail);
                        const group = segDetail?.$?.Group;
                        const FlightDetail = segDetail['air:FlightDetailsRef'] ?
                            toArray(segDetail['air:FlightDetailsRef']).map(fi => FlightDetailsListArr[fi?.$?.Key] || null) : [];
                        const SegmentsFields = ["Carrier", "FlightNumber","AirLineName", "Origin","OriginAirPortName","OriginCity", "Destination","DestinationAirPortName","DestinationCity", "DepartureTime", "ArrivalTime", "FlightTime", "BookingCode", "BookingCount", "CabinClass"];
                        const FlightFields = ["Key", "Equipment"];

                        const formattedSeg = this.keepDollarFields(segDetail, SegmentsFields,airportCacheList,airlineCacheList);
                        const formattedFlightDetail = this.removeDollarFields(...FlightDetail, FlightFields);

                        formattedSeg.BookingCode = bookingInfoDetail[segKey]?.BookingCode || "";
                        formattedSeg.BookingCount = bookingInfoDetail[segKey]?.BookingCount || "";
                        formattedSeg.CabinClass = bookingInfoDetail[segKey]?.CabinClass || "";
                        //formattedSeg.AirportName = airportCacheList[] || '';

                        priceIdArr.cabinClass = formattedSeg.CabinClass || '';
                        if (routeList[group] === onwardKey) {
                            flightObj.segment.onward.push(formattedSeg);
                            flightObj.flightDetail.onward.push(formattedFlightDetail);
                        }
                        if (routeList[group] === returnKey) {
                            if (!flightObj.segment.return) {
                                flightObj.segment.return = [];
                                flightObj.flightDetail.return = [];
                            }
                            flightObj.segment.return.push(formattedSeg);
                            flightObj.flightDetail.return.push(formattedFlightDetail);
                        }
                        uniqueFlightKey += `|${formattedSeg.Carrier}-${formattedSeg.FlightNumber}-${formattedSeg.Origin}-${formattedSeg.Destination}-${formattedSeg.DepartureTime}-${formattedSeg.ArrivalTime}`;
                    }
                    //priceIdArr['segments'] = pIdSegments;
                    //priceIdArr['SearchPassenger'] = pIdSearchPassenger;
                }

                flightObj.fareDetail = fareDetailsWithOutCal;
                flightObj.priceId = this.encrypt(priceIdArr);
            }
            if (uniqueFlightKey) {
                uniqueFlightKey = crypto.createHash('md5').update(uniqueFlightKey).digest('hex');
                if (!finalFlightDetail[uniqueFlightKey]) {
                    finalFlightDetail[uniqueFlightKey] = [];
                }

                const newFareFamily = flightObj?.fareDetail?.fareFamily;
                const alreadyExists = finalFlightDetail[uniqueFlightKey].some(
                    item => item?.fareDetail?.fareFamily === newFareFamily
                );

                if (finalFlightDetail[uniqueFlightKey].length === 0 || !alreadyExists) {
                    finalFlightDetail[uniqueFlightKey].push(flightObj);
                }
            }
        }

        return finalFlightDetail;
    }

    async airPrice(priceIdEnc) {
        const user_id = priceIdEnc.user_id;
        const msg = "Price Id Expired!. Please try again.";
        const toArray = (v) => Array.isArray(v) ? v : [v];
        const price_id = priceIdEnc.price_id;
        let decryptedPriceId;
        try {
            decryptedPriceId = this.decrypt(price_id);
        } catch (error) {
            throw {
                status: 500,
                message: error.message,
                error: error.message
            };
        }
        const { searchData, APSref, app_ref, fareFamily, providerCode, cabinClass } = decryptedPriceId;
        const app_reference = app_ref;
        if (!decryptedPriceId || !APSref || !app_ref || !providerCode || !fareFamily || !cabinClass) {
            throw {
                status: 500,
                message: msg,
                error: msg
            };
        }
        try {
            let flightAprData = await FlightModel.flightAprData(decryptedPriceId);
//console.log(flightAprData);
            if (flightAprData) {
                const jsonData = await xml2js.parseStringPromise(flightAprData.response, { explicitArray: false }).catch(() => null);

                const body = jsonData?.['SOAP:Envelope']?.['SOAP:Body'] || {};

                const fault = body?.['SOAP:Fault'];
                const AirPriceRsp = body?.['air:LowFareSearchRsp'] || {};
                const APS = AirPriceRsp?.['air:AirPricingSolution'] || {};

                const HostTokenListArr = this.makeMap(AirPriceRsp?.['air:HostTokenList']?.['common_v52_0:HostToken']);
                const AirSegmentListArr = this.makeMap(AirPriceRsp?.['air:AirSegmentList']?.['air:AirSegment']);
                const FareInfoListArr = this.makeMap(AirPriceRsp?.['air:FareInfoList']?.['air:FareInfo']);

                if (fault) {
                    throw new Error('Flight detail not found!');
                }
                const [AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP] = await Promise.all([
                    FlightModel.getAdminDistMarkup_New(user_id),
                    FlightModel.getPLBData_New(user_id),
                    FlightModel.get_agent_markup(user_id)
                ]);
                let isOpsMatched = false;
                for (const solution in APS) {
                    if (APS[solution]?.$?.Key !== APSref) {
                        continue;
                    }
                   // console.log((APS[solution]?.$?.Key === APSref),APS[solution]?.$?.Key , APSref);
                    if (APS[solution]?.$?.Key === APSref) {
                        isOpsMatched = true;
                        let pIdHostToken = [];
                        let pIdfareInfo = [];
                        const journeys = toArray(APS[solution]?.['air:Journey']);

                        const segmentRefs = journeys.flatMap(journey =>
                            toArray(journey['air:AirSegmentRef'])
                        );

                        const segmentKeys = segmentRefs.map(ref => ref?.['$']?.Key);
                        const segments = segmentKeys.map(k => AirSegmentListArr[k] ? JSON.parse(JSON.stringify(AirSegmentListArr[k])) : null).filter(Boolean);

                        const bookingInfoDetail = {};
                        for (const pInfo of toArray(APS[solution]?.['air:AirPricingInfo'])) {
                            const fareRefs = toArray(pInfo?.['air:FareInfoRef']);
                            for (const bookingInfoType of toArray(pInfo?.['air:BookingInfo'])) {
                                const BookingSegmentRef = bookingInfoType?.$?.SegmentRef;
                                bookingInfoDetail[BookingSegmentRef] = bookingInfoType?.$ || {};

                                const BookingSHostTokenRef = bookingInfoType?.$?.HostTokenRef;
                                const BookingCodeArr = bookingInfoType?.$?.BookingCode;
                                segments.forEach(flight => {
                                    if (flight.$.Key === BookingSegmentRef) {
                                        flight.$.ClassOfService = BookingCodeArr;
                                    }
                                });
                                if (providerCode.toLowerCase() == 'ach') {
                                    let singleHostToken = HostTokenListArr[BookingSHostTokenRef];
                                    if (!pIdHostToken.includes(singleHostToken)) {
                                        singleHostToken.seg = BookingSegmentRef;
                                        pIdHostToken.push(singleHostToken);
                                    }
                                }
                                const BookingSFareInfoRef = bookingInfoType?.$?.FareInfoRef;
                                const BookingCode = bookingInfoType?.$?.BookingCode;
                                let singleFareInfo = FareInfoListArr[BookingSFareInfoRef];
                                if (singleFareInfo?.$?.FareBasis) {
                                    const exists = pIdfareInfo.some(item =>
                                        item.AirSegmentRef === BookingSegmentRef &&
                                        item.FareBasisCode === singleFareInfo.$.FareBasis
                                    );

                                    if (!exists) {
                                        pIdfareInfo.push({
                                            AirSegmentRef: BookingSegmentRef,
                                            FareBasisCode: singleFareInfo.$.FareBasis,
                                            BookingCode: BookingCode
                                        });
                                    }
                                }
                            }
                        }

                        const xmlRequest = await getFlighstAirPriceRequest(priceIdEnc, pIdHostToken, pIdfareInfo, segments, app_reference, APS[solution], providerCode);

                        const [airPriceRes] = await Promise.allSettled([
                            processRequest(xmlRequest)
                        ]);
                        const desUniqIdText = `travelport_air_price_`;
                        const desUniqId = uuidv4();
                        const desUniqIdDes = `${desUniqIdText}${desUniqId}`;

                        const apsLogId = await FlightModel.flight_xml_log(app_reference, xmlRequest, airPriceRes.value, desUniqIdDes, user_id);

                        const [jsonAirPrice] = await Promise.all([
                            airPriceRes.status === 'fulfilled'
                                ? xml2js.parseStringPromise(airPriceRes.value, { explicitArray: false }).catch(err => null)
                                : null
                        ]);

                        const finalArr = {};
                        const body = jsonAirPrice?.['SOAP:Envelope']?.['SOAP:Body'] || {};
                        const fault = body?.['SOAP:Fault'];
                        const AirPriceRsp = body?.['air:AirPriceRsp'];

                        if (fault) {
                            throw new Error('Flight detail not found!');
                        }
                        let finalResults = {};
                        const AprResponse = await this.manageAirPriceData(AirPriceRsp, app_reference, searchData, AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP, desUniqId);
                        for (const [uniqueKey, fareArr] of Object.entries(AprResponse)) {
                            if (!finalResults[uniqueKey]) {
                                finalResults[uniqueKey] = [];
                            }
                            finalResults[uniqueKey].push(...fareArr);
                        }

                        if (finalResults.length === 0) {
                            return {
                                status: 0,
                                message: "No flight found"
                            };
                        }
                        return {
                            status: 1,
                            message: "Success",
                            data: finalResults
                        };
                    }
                    // else{
                    //     throw {
                    //         status: 500,
                    //         message: 'Flight detail not fond. Please try again',
                    //     };
                    // }
                }
                if (!isOpsMatched) {
                    throw {
                        status: 500,
                        message: 'Flight detail not found. Please try again',
                    };
                }
            } else {
                throw {
                    status: 500,
                    message: msg,
                    error: msg
                };
            }
        } catch (error) {
            throw {
                status: 500,
                message: error.message,
                error: error.message
            };
        }
    }
    async manageAirPriceData(rsp, app_reference, searchData, AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP, desUniqId = '', fromReprice = '') {

        let fromCityDomestic = '';
        let toCityDomestic = '';
        const fromKey = `isDomestic_${searchData.from}`;
        const toKey = `isDomestic_${searchData.to}`;
        const getFromCity = await getCacheData(fromKey);
        const getToCity = await getCacheData(toKey);
        let airportCacheList = await getCacheData('all_airport_list_raw');
        let airlineCacheList = await getCacheData('all_airline_list_raw');
        if (!getFromCity) {
            let fromDomestic = await FlightModel.checkIsDomestic(searchData.from);
            await setCacheData(fromKey, fromDomestic, 604800);
            fromCityDomestic = fromDomestic;
        } else {
            fromCityDomestic = getFromCity;
        }
        if (!getToCity) {
            let toDomestic = await FlightModel.checkIsDomestic(searchData.to);
            await setCacheData(fromKey, toDomestic, 604800);
            toCityDomestic = toDomestic;
        } else {
            toCityDomestic = getToCity;
        }
        let finalType = (fromCityDomestic === 'domestic' && toCityDomestic === 'domestic')
            ? 'domestic'
            : 'international';

        let checkFlightType = finalType || 'international';

        let managementFee = 0;
        let managementFeeTax = 0;
        if (TravelportAdapter.manageMentFeeApplicable) {
            managementFee = TravelportAdapter.manageMentFee;
            managementFeeTax = TravelportAdapter.manageMentFeeTax;
        }

        const totalPax = Number(searchData.adult || 0) + Number(searchData.child || 0) + Number(searchData.infant || 0);
        const user_id = searchData.user_id || null;
        const onwardKey = `${searchData.from} - ${searchData.to}`;
        const returnKey = `${searchData.to} - ${searchData.from}`;

        const toArray = (v) => Array.isArray(v) ? v : [v];
        const AirSegmentListArr = this.makeMap(rsp?.['air:AirItinerary']?.['air:AirSegment']);
        const HostTokenListArr = this.makeMap(rsp?.['air:AirItinerary']?.['common_v52_0:HostToken']);
        const APSArr = toArray(rsp?.['air:AirPriceResult']?.['air:AirPricingSolution']);
        const airPricingInfos = toArray(rsp?.['air:AirPriceResult']?.['air:AirPricingSolution']?.['air:AirPricingInfo']);

        const OptionalServicesTotal = rsp?.['air:AirPriceResult']?.['air:AirPricingSolution']?.['air:OptionalServices']?.['air:OptionalServicesTotal'] || {};
        const rePriceOptionaService = rsp?.['air:AirPriceResult']?.['air:AirPricingSolution']?.['air:OptionalServices']?.['air:OptionalService'] || {};
        let opTotal = OptionalServicesTotal?.$?.TotalPrice.replace(/[^\d.]/g, "") || 0;
        let mealTotalprice = 0;
        let baggageTotalprice = 0;
        let seatTotalprice = 0;
        for (const opt of toArray(rePriceOptionaService)) {
            const servicetype = opt?.$?.Type.toLocaleLowerCase();
            const serviceSt = opt?.$?.ServiceStatus.toLocaleLowerCase();
            const servicePrice = opt?.$?.TotalPrice.replace(/[^\d.]/g, "");
            if (serviceSt == 'priced' && servicetype == 'prereservedseatassignment') {
                seatTotalprice += servicePrice;
            }
            if (serviceSt == 'priced' && servicetype == 'mealorbeverage') {
                mealTotalprice += servicePrice;
            }

            if (serviceSt == 'priced' && servicetype == 'mealorbeverage') {
                baggageTotalprice += servicePrice;
            }
        }
        const FareInfoListArr = airPricingInfos.flatMap(pricingInfo =>
            toArray(pricingInfo['air:FareInfo'])
        );
        const BrandListArr = FareInfoListArr.flatMap(brand =>
            toArray(brand['air:Brand'])
        );

        const routeList = {};

        const flightsByGroup = {};
        Object.values(AirSegmentListArr).forEach(flight => {
            const group = flight.$.Group;
            if (!flightsByGroup[group]) flightsByGroup[group] = [];
            flightsByGroup[group].push(flight);
        });
        Object.entries(flightsByGroup).forEach(([group, flights]) => {
            flights.sort((a, b) => new Date(a.$.DepartureTime) - new Date(b.$.DepartureTime));
            const origin = flights[0].$.Origin;
            const destination = flights[flights.length - 1].$.Destination;
            routeList[group] = `${origin} - ${destination}`;
        });
        const finalFlightDetail = [];

        for (const apSolution of APSArr) {
            let uniqueFlightKey = "";
            let flightObj = {
                segment: { onward: [] },
                fareDetail: {},
                paxFare: {},
                pre_booking_id: "",
                is_gst: 0,
                isPassportRequired: 0,
                isDob: 0,
                app_reference:"",
                paxInfo:{}
            };
            if (checkFlightType == 'international') {
                flightObj.isPassportRequired = 1;
                flightObj.isDob = 1;
            }
            const pre_booking_id_arr = { AirSegmentListArr: '', HostTokenListArr: '', app_reference: app_reference, providerCode: '' };
            //if (desUniqId != '') {
            pre_booking_id_arr.AirSegmentListArr = AirSegmentListArr;
            //pre_booking_id_arr.HostTokenListArr = HostTokenListArr;
            //pre_booking_id_arr.searchData = searchData;
            //pre_booking_id_arr.aprUniqueId = desUniqId;
            // pre_booking_id_arr.aprUniqueId = {
            //     value: desUniqId,
            //     HostTokenListArr: HostTokenListArr
            // };

            //console.log(desUniqId,pre_booking_id_arr);return false;

            //}
            //pre_booking_id_arr.rsp = rsp;

            const apsAttr = apSolution?.$;
            if (true || apsAttr?.CompleteItinerary === 'true' || !apsAttr.CompleteItinerary) {
                let fareDetailsWithOutCal = {
                    totalprice: this.getUnifiedPrice(['EquivalentTotalPrice', 'ApproximateTotalPrice', 'TotalPrice'], apSolution),
                    baseprice: this.getUnifiedPrice(['EquivalentBasePrice', 'ApproximateBasePrice', 'BasePrice'], apSolution),
                    taxes: this.getUnifiedPrice(['EquivalentTaxes', 'ApproximateTaxes', 'Taxes'], apSolution),
                    fees: this.getUnifiedPrice(['EquivalentFees', 'ApproximateFees', 'Fees'], apSolution),
                    services: this.getUnifiedPrice(['EquivalentServices', 'ApproximateServices', 'Services'], apSolution),
                    managementFee: managementFee,
                    manageMentFeeTax: managementFeeTax,
                };

                const paxPriceDetails = {};
                const bookingInfoDetail = {};
                const paxInfo = [];

                for (const pInfo of toArray(apSolution['air:AirPricingInfo'])) {
                    const ff = toArray(pInfo?.['air:FareInfo'])?.[0]?.['$']?.Key || '';
                    const fareFamily = FareInfoListArr.find(f => f?.$?.Key === ff)?.$?.FareFamily || null;

                    //const fareFamily = FareInfoListArr[ff]?.$?.FareFamily || BrandListArr[pInfo?.['air:BrandRef']?.[0]?.$?.BrandID]?.$?.Name || "Published";
                    const refundType = 'Non-Refundable';
                    fareDetailsWithOutCal.fareFamily = fareFamily;
                    fareDetailsWithOutCal.refundType = refundType;
                    if (opTotal > 0) {
                        fareDetailsWithOutCal.optionalSerivceTotal = opTotal;
                    }
                    const providerCode = pInfo?.$?.ProviderCode || "";
                    const platingCarrier = pInfo?.$?.platingCarrier || "";
                    let group_type = "";
                    if (providerCode === "ACH") {
                        group_type = "LCC";
                    } else {
                        group_type = platingCarrier || "GDS";
                    }
                    if (desUniqId != '') {
                        pre_booking_id_arr.providerCode = providerCode;
                    }

                    if (providerCode.toLowerCase() == 'ach' && fareFamily.toLowerCase() == 'sme') {
                        flightObj.is_gst = 1;
                    }
                    for (const passType of toArray(pInfo?.['air:PassengerType'])) {
                        for (const bookingInfoType of toArray(pInfo?.['air:BookingInfo'])) {
                            const BookingSegmentRef = bookingInfoType?.$?.SegmentRef;
                            bookingInfoDetail[BookingSegmentRef] = bookingInfoType?.$ || {};
                        }
                        let PaxTypeCode = passType?.$?.Code;
                        let BookingTravelerRef = passType?.$?.BookingTravelerRef;

                        PaxTypeCode = (PaxTypeCode === 'CNN') ? 'CHD' : PaxTypeCode;
                        
                        paxInfo.push({
                            type: PaxTypeCode,
                            ref: BookingTravelerRef
                        });
                        
                        let paxPriceWithOutCal = {
                            totalprice: this.getUnifiedPrice(['EquivalentTotalPrice', 'ApproximateTotalPrice', 'TotalPrice'], pInfo),
                            baseprice: this.getUnifiedPrice(['EquivalentBasePrice', 'ApproximateBasePrice', 'BasePrice'], pInfo),
                            taxes: this.getUnifiedPrice(['EquivalentTaxes', 'ApproximateTaxes', 'Taxes'], pInfo),
                            fees: this.getUnifiedPrice(['EquivalentFees', 'ApproximateFees', 'Fees'], pInfo),
                            services: this.getUnifiedPrice(['EquivalentServices', 'ApproximateServices', 'Services'], pInfo)
                        }
                        let commission = {};
                        if (PaxTypeCode != 'INF') {
                            commission = await this.getCommisionCalF(providerCode, paxPriceWithOutCal.baseprice, paxPriceWithOutCal.totalprice, paxPriceWithOutCal.fees, fareFamily, paxPriceWithOutCal.services, 1, group_type, user_id, true, true, AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP)
                        }
                        paxPriceWithOutCal = {
                            ...paxPriceWithOutCal,
                            ...commission
                        };

                        paxPriceDetails[PaxTypeCode] = paxPriceWithOutCal;
                    }
                    const commission = await this.getCommisionCalF(providerCode, fareDetailsWithOutCal.baseprice, fareDetailsWithOutCal.totalprice, fareDetailsWithOutCal.fees, fareFamily, fareDetailsWithOutCal.services, totalPax, group_type, user_id, true, false, AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP)

                    fareDetailsWithOutCal = {
                        ...fareDetailsWithOutCal,
                        ...commission
                    };
                }
                flightObj.paxInfo = paxInfo;

                flightObj.paxFare = Object.entries(paxPriceDetails)
                    .map(([paxType, price]) => {
                        const updatedShowingFare = (price.ShowingFare || 0) ;//+ managementFee + managementFeeTax;
                        let paxCount = 0;
                        let TaxNmrkp = 0;
                        if (paxType === 'ADT') {
                            paxCount = searchData.adult;
                            TaxNmrkp = price.TaxNmrkp;
                        } else if (paxType === 'CHD' || paxType === 'CNN') {
                            paxCount = searchData.child;
                            TaxNmrkp = price.TaxNmrkp;
                        } else if (paxType === 'INF') {
                            paxCount = searchData.infant;
                        }

                        let snfObj = {
                            paxType,
                            ...price,
                            ShowingFare: updatedShowingFare,
                            paxCount: paxCount,
                            TaxNmrkp: TaxNmrkp,
                        };
                        if (opTotal > 0) {
                            snfObj.mealTotalprice = mealTotalprice;
                            snfObj.baggageTotalprice = baggageTotalprice;
                            snfObj.seatTotalprice = seatTotalprice;
                        }

                        return snfObj;
                    });
                let pIdSegments = [];
                for (const item of toArray(apSolution['air:AirSegmentRef'])) {
                    const segKey = item.$.Key;
                    const segDetail = AirSegmentListArr?.[segKey] || {};
                    pIdSegments.push(segDetail);
                    const group = segDetail?.$?.Group;
                    // const SegmentsFields = ["Carrier", "FlightNumber", "Origin", "Destination", "DepartureTime", "ArrivalTime", "FlightTime", , "BookingCode", "BookingCount", "CabinClass"];
                    const SegmentsFields = ["Carrier", "FlightNumber","AirLineName", "Origin","OriginAirPortName","OriginCity", "Destination","DestinationAirPortName","DestinationCity", "DepartureTime", "ArrivalTime", "FlightTime", "BookingCode", "BookingCount", "CabinClass"];
                
                    const formattedSeg = this.keepDollarFields(segDetail, SegmentsFields,airportCacheList,airlineCacheList);
                    formattedSeg.BookingCode = bookingInfoDetail[segKey]?.BookingCode || "";
                    formattedSeg.BookingCount = bookingInfoDetail[segKey]?.BookingCount || "";
                    formattedSeg.CabinClass = bookingInfoDetail[segKey]?.CabinClass || "";

                    if (routeList[group] === onwardKey) {
                        flightObj.segment.onward.push(formattedSeg);
                    }
                    if (routeList[group] === returnKey) {
                        if (!flightObj.segment.return) {
                            flightObj.segment.return = [];
                        }
                        flightObj.segment.return.push(formattedSeg);
                    }
                    uniqueFlightKey += `${formattedSeg.Carrier}-${formattedSeg.FlightNumber}-${formattedSeg.Origin}-${formattedSeg.Destination}-${formattedSeg.DepartureTime}-${formattedSeg.ArrivalTime}`;
                }
                flightObj.fareDetail = fareDetailsWithOutCal;
                if (desUniqId != '') {
                    flightObj.pre_booking_id = this.encrypt(pre_booking_id_arr);
                }

                if (fromReprice != '') {
                    flightObj.pre_booking_id = fromReprice;
                    flightObj.app_reference = searchData.app_reference;
                } else {
                    flightObj.saerchId = this.encrypt(searchData);
                    //flightObj.apUniqueId = desUniqId;
                    flightObj.apUniqueId = this.encrypt({
                        value: desUniqId,
                        HostTokenListArr: HostTokenListArr
                    });
                    
                }
            }
            if (uniqueFlightKey) {
                uniqueFlightKey = crypto.createHash('md5').update(uniqueFlightKey).digest('hex');
                if (!finalFlightDetail[uniqueFlightKey]) {
                    finalFlightDetail[uniqueFlightKey] = [];
                }

                finalFlightDetail[uniqueFlightKey].push(flightObj);
            }
        }
        return finalFlightDetail;
    }

    async GetOptionalServices(postData) {
        // function getPassengerByRef(ref) {
        //     for (const paxType in postData.pax) {
        //         const passenger = postData.pax[paxType].find(p => p.traveller_ref === ref);
        //         if (passenger) {
        //             return {
        //                 prefix: passenger.prefix,
        //                 first_name: passenger.first_name,
        //                 last_name: passenger.last_name,
        //                 dob: passenger.dob || null,
        //                 age: passenger.age || null
        //             };
        //         }
        //     }
        //     return null;
        // }
        function getPassengerByRef(ref = '', name = '') {
            for (const paxType in postData.pax) {
                const passenger = postData.pax[paxType].find(p => {
                    if (ref) {  return p.traveller_ref === ref; }
                    if (name) {
                        const passengerName = [p.prefix, p.first_name, p.last_name ] .filter(Boolean).join('_').toLowerCase().replace(/\s+/g, '_');
                        return passengerName === name.toLowerCase();
                    }
                    return false;
                });
                if (passenger) {
                    if (name) { return passenger.traveller_ref; }
                    return {
                        prefix: passenger.prefix,
                        first_name: passenger.first_name,
                        last_name: passenger.last_name,
                        dob: passenger.dob || null,
                        age: passenger.age || null
                    };
                }
            }
            return null;
        }
        function replaceTravelerRefs(response) {
            const refMap = {};
            function findTravelers(obj) {
                if (!obj || typeof obj !== 'object') {
                    return;
                }
                if (Array.isArray(obj)) {
                    obj.forEach(item => findTravelers(item));
                    return;
                }
                for (const key of Object.keys(obj)) {
                    const value = obj[key];
                    if (key.endsWith(':SearchTraveler')) {
                        const travelers = Array.isArray(value) ? value : [value];
                        travelers.forEach(traveler => {
                            if (!traveler || typeof traveler !== 'object') {return;}
                            const oldRef = traveler.$?.Key;
                            if (!oldRef) {return;}
                            const nameObj = traveler['common_v52_0:Name'];
                            if (!nameObj) {return;}
                            const nameData = Array.isArray(nameObj) ? nameObj[0] : nameObj;
                            const prefix = nameData.$?.Prefix || '';
                            const first = nameData.$?.First || '';
                            const last = nameData.$?.Last || '';
                            const name = [prefix,first,last].filter(Boolean).join('_').toLowerCase().replace(/\s+/g, '_');
                            const newRef = getPassengerByRef('', name);
                            // console.log('oldRef:', oldRef);
                            // console.log('name:', name);
                            // console.log('newRef:', newRef);
                            if (newRef && oldRef !== newRef) {
                                refMap[oldRef] = newRef;
                            }
                        });
                    }
                    findTravelers(value);
                }
            }
            findTravelers(response);
            //console.log('REF MAP:', refMap);
            function replaceRefs(obj) {
                if (!obj || typeof obj !== 'object') {
                    return obj;
                }
                if (Array.isArray(obj)) {
                    return obj.map(item => replaceRefs(item));
                }
                for (const key of Object.keys(obj)) {
                    let value = obj[key];
                    if (typeof value === 'string') {
                        for (const [oldRef, newRef] of Object.entries(refMap)) {
                            value = value.split(oldRef).join(newRef);
                        }
                        obj[key] = value;
                    } else if (typeof value === 'object' && value !== null) {
                        replaceRefs(value);
                    }
                }
                return obj;
            }
            return replaceRefs(response);
        }

        const user_id = postData.user_id;
        const msg = "Pre Booking Id Expired!. Please try again.";
        const toArray = (v) => Array.isArray(v) ? v : [v];
        let preBookingId = postData.pre_booking_id;
        let preSaerchId = postData.saerchId;
        let preApUniqueId = postData.apUniqueId;
        let decryptedPriceId; let decryptedpApUniqueId; let decryptedSaerchId;
        try {
            decryptedPriceId = this.decrypt(preBookingId);
            decryptedSaerchId = this.decrypt(preSaerchId);
            decryptedpApUniqueId = this.decrypt(preApUniqueId);

            const { AirSegmentListArr, providerCode } = decryptedPriceId;
            const app_reference = decryptedSaerchId.app_reference;
            const aprUniqueId = decryptedpApUniqueId.value;
            const HostTokenListArr = decryptedpApUniqueId.HostTokenListArr;
            const searchData = decryptedSaerchId;
            if (!AirSegmentListArr || !HostTokenListArr || !app_reference) {
                throw {
                    status: 500,
                    message: msg,
                    error: msg
                };
            }
            const xmlRequest = await getFlighstOptionalServicesRequest(postData, AirSegmentListArr, HostTokenListArr, app_reference, providerCode);
            const [seatMapRes] = await Promise.allSettled([
                processRequest(xmlRequest)
            ]);

            const apsLogId = await FlightModel.flight_xml_log(app_reference, xmlRequest, seatMapRes.value, "Travelport Seat Map NODE", user_id);
            let [seatMapJson] = await Promise.all([
                seatMapRes.status === 'fulfilled'
                    ? xml2js.parseStringPromise(seatMapRes.value, { explicitArray: false }).catch(err => null)
                    : null
            ]);

            // const xmlResponse = await FlightModel.get_xml_log('41643');
            // const jsonData = await xml2js.parseStringPromise(xmlResponse.response, { explicitArray: false }).catch(() => null);
            // const seatMapJson = jsonData;
            seatMapJson = replaceTravelerRefs(seatMapJson);

            const body = seatMapJson?.['SOAP:Envelope']?.['SOAP:Body'] || {};
            const fault = body?.['SOAP:Fault'];
            const airSeatMapRsp = body?.['air:SeatMapRsp'];

            const mealpassengerMap = {};
            const segmentSeatMap = {};
            const segmentMealBagsArr = {};
            const rowsBySegmentRef = {};

            let airPriceData = await FlightModel.getAirPriceXml(aprUniqueId, app_reference);
            const aprRespXmlData = await xml2js.parseStringPromise(airPriceData.response, { explicitArray: false }).catch(() => null);
            const aprBody = aprRespXmlData?.['SOAP:Envelope']?.['SOAP:Body'] || {};
            const aprFault = aprBody?.['SOAP:Fault'];
            const AirPricingSolution = aprBody?.['air:AirPriceRsp']?.['air:AirPriceResult']?.['air:AirPricingSolution'];
            const aprOptionalService = toArray(AirPricingSolution?.['air:OptionalServices']?.['air:OptionalService']);
            const aprRespAprSolution = toArray(AirPricingSolution);

            const airSegments = toArray(airSeatMapRsp?.['air:AirSegment']);
            const airRows = toArray(airSeatMapRsp?.['air:Rows']);
            const passengers = toArray(airSeatMapRsp?.['air:SearchTraveler']);
            const OptionalServicesArr = this.makeMap(airSeatMapRsp?.['air:OptionalServices']?.['air:OptionalService']);
            const SeatMapOpsArr = toArray(airSeatMapRsp?.['air:OptionalServices']?.['air:OptionalService']);

            airRows.forEach(rowGroup => {
                const segmentRef = rowGroup?.$?.SegmentRef;
                if (segmentRef) {
                    rowsBySegmentRef[segmentRef] = toArray(rowGroup['air:Row']);
                }
            });
            const paxnameByKey = Object.fromEntries(
                passengers.map(t => {
                    const { Prefix, First, Last } = t["common_v52_0:Name"].$;
                    return [
                        t.$.Key,
                        `${Prefix.toLocaleLowerCase()}_${First.toLocaleLowerCase()}_${Last.toLocaleLowerCase()}`
                    ];
                })
            );
        //console.log('paxnameByKey',paxnameByKey)
            airSegments.forEach(segment => {
                const segmentKey = segment?.$?.Key;
                const flightNumber = segment?.$?.FlightNumber;
                const flightOrigin = segment?.$?.Origin;
                const flightDestination = segment?.$?.Destination;
                if (!segmentKey || !flightNumber) return;
                const rows = rowsBySegmentRef[segmentKey];
                if (!rows || !rows.length) return;
                segmentSeatMap[flightNumber] = {};
                segmentMealBagsArr[flightNumber] = {};
                if (providerCode.toLowerCase() == 'ach') {
                    aprOptionalService.forEach(aprOpService => {
                        const ServiceData = toArray(aprOpService['common_v52_0:ServiceData']);
                        let newServiceData = {};
                        for (const cdata of ServiceData) {
                            if (cdata?.$?.AirSegmentRef == segmentKey) {
                                newServiceData = cdata
                            }
                        }
                        //const serviceDataAttr = aprOpService['common_v52_0:ServiceData']?.$;
                        const serviceDataAttr = newServiceData?.$;
                        const Type = aprOpService?.$?.Type;
                        const passengerRef = serviceDataAttr?.BookingTravelerRef;
                        const segmentRef = serviceDataAttr?.AirSegmentRef;
                        if (passengerRef) {
                            // if (!segmentMealBagsArr[flightNumber][passengerRef]) {
                            //     segmentMealBagsArr[flightNumber][passengerRef] = [];
                            // }

                            if (!segmentMealBagsArr[flightNumber]) {
                                segmentMealBagsArr[flightNumber] = {};
                            }

                            if (!segmentMealBagsArr[flightNumber][passengerRef]) {
                                segmentMealBagsArr[flightNumber][passengerRef] = {
                                    meal: [],
                                    baggage: []
                                };
                            }
                            const serviceObj = {};
                            const op_ids = this.encrypt(aprOpService);
                            if (Type.toLowerCase().includes("meal") || Type.toLowerCase().includes("baggage")) {
                                // let opserviceData = {
                                //     flight: { 
                                //         flight_number: flightNumber, 
                                //         ref: segmentKey, 
                                //         source: `${flightOrigin}-${flightDestination}`
                                //     }
                                //     , passenger: [],
                                //     'opService': aprOpService  
                                // };
                                const clonedService = JSON.parse(JSON.stringify(aprOpService));
                                clonedService['common_v52_0:ServiceData'] = [newServiceData];
                                
                                let opserviceData = {
                                    flight: {
                                        flight_number: flightNumber,
                                        ref: segmentKey,
                                        selected_segment: segmentRef,
                                        source: `${flightOrigin}-${flightDestination}`
                                    },
                                    selectedPassengerRef: passengerRef,
                                    selectedSegmentRef: segmentRef,
                                    passenger: [],
                                    //opService: aprOpService
                                    opService: clonedService
                                };
                                serviceObj.type = Type;
                                serviceObj.TotalPrice = aprOpService?.$?.TotalPrice;
                                serviceObj.DisplayText = aprOpService?.$?.DisplayText;
                                serviceObj.Quantity = aprOpService?.$?.Quantity;
                                serviceObj.op_id = this.encrypt(opserviceData);

                            }
                            if (serviceObj && Object.keys(serviceObj).length > 0) {
                                //segmentMealBagsArr[flightNumber][passengerRef].push(serviceObj);
                                if (Type.toLowerCase().includes("meal")) {

                                    segmentMealBagsArr[flightNumber][passengerRef]
                                        .meal.push(serviceObj);

                                } else {

                                    segmentMealBagsArr[flightNumber][passengerRef]
                                        .baggage.push(serviceObj);

                                }
                            }
                        }
                    });
                } else {
                    const PricingInfo = toArray(AirPricingSolution?.['air:AirPricingInfo']);

                    PricingInfo.forEach(PricingInfo => {
                        let Brand = PricingInfo?.['air:FareInfo']?.['air:Brand'];
                        const opS = toArray(Brand?.['air:OptionalServices']?.['air:OptionalService']);

                        opS.forEach(aprOpService => {
                            const ServiceData = toArray(aprOpService['common_v52_0:ServiceData']);

                            let newServiceData = {};
                            for (const cdata of ServiceData) {
                                if (cdata?.$?.AirSegmentRef == segmentKey) {
                                    newServiceData = cdata
                                }
                            }
                            const serviceDataAttr = newServiceData?.$;
                            const Type = aprOpService?.$?.Type || '';
                            const passengerRef = serviceDataAttr?.BookingTravelerRef || '';
                            if (passengerRef) {
                                if (!segmentMealBagsArr[flightNumber][passengerRef]) {
                                    segmentMealBagsArr[flightNumber][passengerRef] = [];
                                }
                                const serviceObj = {};
                                const op_ids = this.encrypt(aprOpService);
                                if (Type.toLowerCase().includes("meal") || Type.toLowerCase().includes("baggage")) {
                                    let opserviceData = {
                                        flight: { flight_number: flightNumber, ref: segmentKey, source: `${flightOrigin}-${flightDestination}` }
                                        , passenger: [],
                                        'opService': aprOpService
                                    };
                                    serviceObj.type = Type;
                                    serviceObj.TotalPrice = aprOpService?.$?.TotalPrice;
                                    serviceObj.DisplayText = aprOpService?.$?.DisplayText;
                                    serviceObj.Quantity = aprOpService?.$?.Quantity;
                                    serviceObj.op_id = this.encrypt(opserviceData);

                                }
                                if (serviceObj && Object.keys(serviceObj).length > 0) {
                                    segmentMealBagsArr[flightNumber][passengerRef].push(serviceObj);
                                }
                            }
                        });
                    });
                }
                const ENABLE_SEAT_MAP = true;
                if (ENABLE_SEAT_MAP) {
                    rows.forEach(row => {
                        const passengerRef = row?.$?.SearchTravelerRef || '';
                        //console.log('passengerRef',passengerRef);
                        const paxName = paxnameByKey[passengerRef];
                        if (!passengerRef) return;
                        const seats = toArray(row['air:Facility']);
                        const seatLookup = {};
                        seats.forEach(seat => {
                            const code = seat?.$?.SeatCode;
                            if (code) {
                                seatLookup[code] = `${code}`;
                            }
                        });
                        const rowObject = {};

                        seats.forEach((seat, index) => {
                            const seatCode = seat?.$?.SeatCode || "0";
                            const availability = seat?.$?.Availability || "unavailable";
                            const remark = seat?.['common_v52_0:Remark'] || "";
                            const characteristic = toArray(seat['air:Characteristic']).map(c => c?.$?.Value).join(",") || "";
                            const OptionalServiceRef = seat?.$?.OptionalServiceRef;
                            let opService = OptionalServicesArr[OptionalServiceRef];
                            if (opService?.['common_v52_0:ServiceData']) {
                                opService['common_v52_0:ServiceData'].$.Data = seatCode;
                            }
                            //console.log('opService',opService);
                            
                            const fare = opService?.$?.TotalPrice.replace(/[^0-9.]/g, "") || "0";

                            let opserviceData = {
                                flight: { flight_number: flightNumber, ref: segmentKey, source: `${flightOrigin}-${flightDestination}` }
                                ,
                                selectedPassengerRef: passengerRef,
                                selectedSegmentRef: segmentKey,
                                passenger: [],
                                'opService': opService
                            };
                            //const op_id = this.encrypt(opService);
                            rowObject[index] = {
                                seatCode,
                                characteristics: characteristic.toLowerCase(),
                                Availability: availability.toLowerCase(),
                                fare,
                                Remark: remark,
                                op_id: opserviceData
                            };

                        });

                        if (!segmentSeatMap[flightNumber][paxName]) {
                            segmentSeatMap[flightNumber][paxName] = [];
                        }
                        segmentSeatMap[flightNumber][paxName].push(rowObject);
                    });
                }
            
                const passengerMap = {};
                const paxMap = {};

                // for meal baggage Array
                aprRespAprSolution.forEach(solution => {
                    const apiRaw = solution['air:AirPricingInfo'];
                    const airPricingInfos = Array.isArray(apiRaw) ? apiRaw : [apiRaw];
                    airPricingInfos.forEach(info => {
                        const ptRaw = info['air:PassengerType'];
                        const passengerTypes = Array.isArray(ptRaw) ? ptRaw : [ptRaw];

                        passengerTypes.map(p => {
                            const paxCode = p?.$?.Code;
                            const paxKey = p?.$?.BookingTravelerRef;
                            // if (segmentMealBagsArr[flightNumber][paxKey]) {
                            //     let seatObjj = segmentMealBagsArr[flightNumber][paxKey];
                            //     Object.keys(seatObjj).forEach(key => {
                            //         let newOpid = this.decrypt(seatObjj[key].op_id);
                            //         const passengerInfo = getPassengerByRef(paxKey);
                            //         newOpid.passenger.push({
                            //             code: paxCode,
                            //             ref: paxKey,
                            //             prefix: passengerInfo?.prefix || '',
                            //             first_name: passengerInfo?.first_name || '',
                            //             last_name: passengerInfo?.last_name || '',
                            //         });
                            //         newOpid = this.encrypt(newOpid);
                            //         seatObjj[key].op_id = newOpid;
                            //     });
                            //     mealpassengerMap[paxKey] = segmentMealBagsArr[flightNumber][paxKey];
                            // }
                            Object.keys(segmentMealBagsArr).forEach(segmentRef => {

                            const seatObjj = segmentMealBagsArr[segmentRef][paxKey];

                            if (!seatObjj) return;

                            ["meal","baggage"].forEach(type => {

                                seatObjj[type].forEach(service => {

                                    let newOpid = this.decrypt(service.op_id);

                                    const passengerInfo = getPassengerByRef(paxKey);

                                    newOpid.passenger.push({
                                        code: paxCode,
                                        ref: paxKey,
                                        prefix: passengerInfo?.prefix || '',
                                        first_name: passengerInfo?.first_name || '',
                                        last_name: passengerInfo?.last_name || ''
                                    });

                                    service.op_id = this.encrypt(newOpid);

                                });

                            });

                            mealpassengerMap[segmentRef] = mealpassengerMap[segmentRef] || {};

                            mealpassengerMap[segmentRef][paxKey] = seatObjj;

                        });

                        });
                    });
                });
                
                // for seat array
                passengers.forEach(pax => {
                    const paxKey = pax?.$?.Key;
                    const paxCode = pax?.$?.Code;
                    const nameObj = pax?.['common_v52_0:Name']?.$;
                    if (!nameObj || !paxKey) return;

                    const prefix = nameObj.Prefix || '';
                    const first = nameObj.First || '';
                    const last = nameObj.Last || '';

                    const fullName = [prefix, first, last].filter(Boolean).join('_').toLocaleLowerCase();
                    paxMap[paxKey] = fullName;
                    // console.log(fullName,'passengers',pax);
                    // console.log('segmentSeatMap',segmentSeatMap);
                    if (segmentSeatMap[flightNumber][fullName]) {
                        let seatObjj = segmentSeatMap[flightNumber][fullName];
                        Object.keys(seatObjj).forEach(key => {
                            Object.values(seatObjj[key]).forEach(pax1 => {
                                if (pax1.op_id) {
                                    pax1.op_id.passenger = { code: paxCode, ref: paxKey };
                                }
                                pax1.op_id = this.encrypt(pax1.op_id);
                            });

                        });
                        //passengerMap[fullName] = segmentSeatMap[flightNumber][paxKey];
                        passengerMap[fullName] = segmentSeatMap[flightNumber][fullName];
                        delete segmentSeatMap[flightNumber][fullName];
                    }

                });
                
                segmentSeatMap[flightNumber] = passengerMap;
                //segmentMealBagsArr[flightNumber] = mealpassengerMap;

            });
            let obj = {
                segmentSeatMap,
                segmentMealBagsArr:mealpassengerMap,
                //mealpassengerMap,
                //'apUniqueId': aprUniqueId,
                //'app_reference': app_reference,
                'saerchId': this.encrypt(searchData),
                'apUniqueId': this.encrypt({ value: aprUniqueId })

            }

            const resp = [obj];
            return {
                status: 1,
                message: "Seat Map List",
                data: resp
            };

        } catch (error) {
            throw {
                status: 500,
                message: error.message,
                error: error.message
            };
        }
    }
    
    async rePrice(data) {
        const ap_unique_id = this.decrypt(data.ap_unique_id).value;
        const searchData = this.decrypt(data.saerchId);
        const app_reference = searchData.app_reference;
        const op_id = data.op_id;
        const user_id = data.user_id;
        const msg = "Op Id Expired!. Please try again.";
        const toArray = (v) => Array.isArray(v) ? v : [v];
        const [AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP] = await Promise.all([
            FlightModel.getAdminDistMarkup_New(user_id),
            FlightModel.getPLBData_New(user_id),
            FlightModel.get_agent_markup(user_id)
        ]);
        let opServices = [];
        try {
            if (Array.isArray(op_id)) {
                opServices = op_id.map(id => this.decrypt(id));
            } else if (op_id) {
                opServices = [this.decrypt(op_id)];
            }
        } catch (error) {
            throw {
                status: 500,
                message: error.message,
                error: error.message
            };
        }
       
        try {
            let aprData = await FlightModel.getAirPriceXml(ap_unique_id, app_reference);

            const jsonData = await xml2js.parseStringPromise(aprData.request, { explicitArray: false }).catch(() => null);
            const aprResponse = await xml2js.parseStringPromise(aprData.response, { explicitArray: false }).catch(() => null);

            if (jsonData) {
                const body = jsonData?.['soapenv:Envelope']?.['soapenv:Body'] || {};
                const aprResponsebody = aprResponse?.['SOAP:Envelope']?.['SOAP:Body'] || {};
                const aprResponsebodyRsp = aprResponsebody?.['air:AirPriceRsp'] || {};
                const fault = body?.['soapenv:Fault'];
                const AirPriceRsp = body?.['AirPriceReq'] || {};
                if (fault) {
                    throw new Error('Flight detail not found!');
                }

                const xmlRequest = await getFlighstRePriceRequest(AirPriceRsp, aprResponsebodyRsp, opServices, app_reference);
                const [airPriceRes] = await Promise.allSettled([
                    processRequest(xmlRequest)
                ]);

                const repriceUniqueTxt = `travelport_reprice_`;
                const repriceUniqId = uuidv4();
                const repriceUniqueId = `${repriceUniqueTxt}${repriceUniqId}`;

                const apsLogId = await FlightModel.flight_xml_log(app_reference, xmlRequest, airPriceRes.value, repriceUniqueId, user_id);
                const [jsonAirPrice] = await Promise.all([
                    airPriceRes.status === 'fulfilled'
                        ? xml2js.parseStringPromise(airPriceRes.value, { explicitArray: false }).catch(err => null)
                        : null
                ]);
                const soapBody = jsonAirPrice?.['SOAP:Envelope']?.['SOAP:Body'] || {};
                const soapFault = soapBody?.['SOAP:Fault'];
                const AirPriceRsp1 = soapBody?.['air:AirPriceRsp'];

                if (soapFault) {
                    throw new Error('Flight detail not found!');
                }
                
                let finalResults = {};
                const AprResponse = await this.manageAirPriceData(AirPriceRsp1, app_reference, searchData, AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP, '', repriceUniqId);
                for (const [uniqueKey, fareArr] of Object.entries(AprResponse)) {
                    if (!finalResults[uniqueKey]) {
                        finalResults[uniqueKey] = [];
                    }
                    finalResults[uniqueKey].push(...fareArr);
                }
                if (finalResults.length === 0) {
                    return {
                        status: 0,
                        message: "No flight found"
                    };
                }
                return {
                    status: 1,
                    message: "Success",
                    data: finalResults
                };

            } else {
                throw {
                    status: 500,
                    message: 'Flight Detail Not Found!.Please try again.',
                    error: 'Flight Detail Not Found!.Please try again.'
                };
            }
        } catch (error) {
            throw {
                status: 500,
                message: error.message,
                error: error.message
            };
        }
    }
   

    formatFlightDate(dateString) {
        if (!dateString) return "";

        const date = new Date(dateString);

        const day = date.getDate().toString().padStart(2, '0');

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun","Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();

        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');

        return `${day} ${month} ${year} ${hours}:${minutes}`;
    }

    async CreateReservation(postData) {
        const user_id = postData.user_id;
        const booking_type = postData.booking_type;
        let userData = await FlightModel.get_user_detail(user_id);
        const reporting_to_id = userData.reporting_to_id;
        const toArray = val => Array.isArray(val) ? val : [val];
        let pre_booking_id = postData.pre_booking_id;
        let app_reference = postData.app_reference;
//console.log('pre_booking_id', pre_booking_id);
        let airPriceData = await FlightModel.getRePriceXml(pre_booking_id, app_reference);
//console.log('airPriceData', airPriceData);return false;
        if (airPriceData == undefined) {
            throw {
                status: 500,
                message: 'invalid detail!',
                error: 'invalid detail!'
            };
        }
        const jsonData = await xml2js.parseStringPromise(airPriceData.response, { explicitArray: false }).catch(() => null);
        if (jsonData) {
            const body = jsonData?.['SOAP:Envelope']?.['SOAP:Body'] || {};
            const fault = body?.['SOAP:Fault'];
            const airPriceResp = body?.['air:AirPriceRsp'] || {};
            const airPriceResult = airPriceResp?.['air:AirPriceResult'] || {};
            const AirPricingSolution = airPriceResult?.['air:AirPricingSolution'] || {};
            if (fault) {
                throw new Error('Flight detail not found!');
            }
            if (AirPricingSolution == undefined) {
                throw {
                    status: 500,
                    message: 'Flight detail not found!',
                    error: 'Flight detail not found!'
                };
            }
            const respData = airPriceResp;
            const segments = toArray(respData?.['air:AirItinerary']?.['air:AirSegment']);
            const segKeys = Object.keys(segments);

            const airPricingSolution = respData?.['air:AirPriceResult']?.['air:AirPricingSolution']
            const priceKey = airPricingSolution?.$?.Key || null;
            const booking_id = TravelportAdapter.generateFlightPriceId(priceKey);

            let BookingInfo = airPricingSolution["air:AirPricingInfo"]["air:BookingInfo"];
            if (BookingInfo && !Array.isArray(BookingInfo)) {
                BookingInfo = [BookingInfo];
            }
            const CabinClassArr = BookingInfo ? BookingInfo.map(fi => fi?.$?.CabinClass || null) : [];
            const CabinClass = CabinClassArr.length > 0 ? CabinClassArr : null;

            let fareInfoArr = toArray(airPricingSolution["air:AirPricingInfo"])[0]?.["air:FareInfo"];
            if (fareInfoArr && !Array.isArray(fareInfoArr)) fareInfoArr = [fareInfoArr];
            const fareFamilies = fareInfoArr ? fareInfoArr.map(fi => fi?.$?.FareFamily || null) : [];
            const fareFamily = fareFamilies.length > 0 ? fareFamilies[0] : null;

            const firstSegment = segments[segKeys[0]]?.$ || {};
            const lastSegment = segments[segKeys[segKeys.length - 1]]?.$ || {};

            const Carrier = firstSegment.Carrier || null;
            const FlightNumber = firstSegment.FlightNumber || null;
            const ClassOfService = firstSegment.ClassOfService || null;
            const cabinClass = firstSegment.CabinClass || null;
            const ProviderCode = firstSegment.ProviderCode || null;

            // Journey Info
            const journeyStart = firstSegment.DepartureTime || null;
            const journeyEnd = lastSegment.ArrivalTime || null;
            const journeyFrom = firstSegment.Origin || null;
            const journeyTo = lastSegment.Destination || null;
            const contactDetail = postData.contact_detail;
            const totalFare = airPricingSolution?.$?.TotalPrice || null;

            const totalPax = Number(postData.adult || 0) + Number(postData.child || 0) + Number(postData.infant || 0);
            let group_type = "";
            let platingCarrier = "";
            if (ProviderCode === "ACH") {
                group_type = "LCC";
            } else {
                group_type = platingCarrier || "GDS";
            }
            let fareDetailsWithOutCal = {
                providerCode: ProviderCode,
                fareFamily: '',
                fareBasis: '',
                totalprice: this.getUnifiedPrice(['EquivalentTotalPrice', 'ApproximateTotalPrice', 'TotalPrice'], airPricingSolution),
                baseprice: this.getUnifiedPrice(['EquivalentBasePrice', 'ApproximateBasePrice', 'BasePrice'], airPricingSolution),
                taxes: this.getUnifiedPrice(['EquivalentTaxes', 'ApproximateTaxes', 'Taxes'], airPricingSolution),
                fees: this.getUnifiedPrice(['EquivalentFees', 'ApproximateFees', 'Fees'], airPricingSolution),
                services: this.getUnifiedPrice(['EquivalentServices', 'ApproximateServices', 'Services'], airPricingSolution),

            };
            const [AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP] = await Promise.all([
                        FlightModel.getAdminDistMarkup_New(user_id),
                        FlightModel.getPLBData_New(user_id),
                        FlightModel.get_agent_markup(user_id)
                    ]);
            const commission = await this.getCommisionCalF(ProviderCode, fareDetailsWithOutCal.baseprice, fareDetailsWithOutCal.totalprice, 
                fareDetailsWithOutCal.fees, fareFamily, fareDetailsWithOutCal.services, totalPax, group_type, user_id, false, false, 
                AdminDistMarkupAll, PLBDATA_All, AGENT_MARKUP,true);
            const dbPool = require("../../database/db1");
            const connection = await dbPool.getConnection();

            const aprRequest = await xml2js.parseStringPromise(airPriceData.request, { explicitArray: false }).catch(() => null);
            const airPriceReqData = aprRequest?.['soapenv:Envelope']?.['soapenv:Body']?.['AirPriceReq'] || {};
            const aprRequestData = toArray(aprRequest?.['soapenv:Envelope']?.['soapenv:Body']?.['AirPriceReq']?.['common:SearchPassenger']) || {};

            const travelerMap = {};
            const codeCounter = {}; // Counter per Code
            aprRequestData.forEach((item) => {
                const code = item.$.Code;
                if (!codeCounter[code]) codeCounter[code] = 0; // Initialize counter if first time
                const key = `${code}_${codeCounter[code]}`;
                travelerMap[key] = item.$.BookingTravelerRef;
                codeCounter[code]++;
            });
            const AirPricingSolution1 = airPriceResp?.['air:AirPriceResult']?.['air:AirPricingSolution']
            const AirPricingInfo = toArray(AirPricingSolution1['air:AirPricingInfo']);
            const providerCode = AirPricingInfo[0]?.['$']?.['ProviderCode'];
            const xmlRequest = await getFlightCreateReservationRequest(app_reference, postData, airPriceResp, travelerMap,airPriceReqData);

            const CheckData = await TravelportAdapter.insertReservationData(airPriceResp, app_reference, postData,commission,xmlRequest);
            // const segments = respData?.segments || {};
    
            await connection.beginTransaction();
            try {
                const [createReservationResp] = await Promise.allSettled([
                    processRequest(xmlRequest)
                ]);
                const acrLogId = await FlightModel.flight_xml_log(app_reference, xmlRequest, createReservationResp.value, "Travelport Create Reservation NODE", user_id);
                const [JsoncreateReservationResp] = await Promise.all([
                    createReservationResp.status === 'fulfilled'
                        ? xml2js.parseStringPromise(createReservationResp.value, { explicitArray: false }).catch(err => {
                            console.error('Failed to parse Air Price response:', err.message);
                            return null;
                        })
                        : (console.error('Air Price request failed:', createReservationResp.reason?.message), null)
                ]);
                let RespCheck = ''; 
                RespCheck = await TravelportAdapter.validAirCreateReservationResponse(postData, JsoncreateReservationResp, app_reference, providerCode,reporting_to_id);
                
                const ledgerData = {
                    agent: commission.NetFare,// 10,
                    dist: 10,//distMarkup * totalPax || 10,
                    app_reference: app_reference
                };
                if(booking_type != 'hold'){
                    TravelportAdapter.manageBlockTransaction(app_reference,'confirm',providerCode,ledgerData,reporting_to_id,postData)
                }
                await connection.commit();
                connection.release();

                return RespCheck;
            } catch (error) {
                // await connection.rollback();
                // connection.release();
                // console.error("ROLLBACK Error:", error);
                return { status: 0, message: "Booking Failed — Transaction Rolled Back", error: error.message };
            }
        }
    }
    static generateUniqueReferenceId() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const date =
            pad(now.getDate()) +
            pad(now.getMonth() + 1) +
            String(now.getFullYear()).slice(-2);
        const time =
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());
        const random =
            Math.floor(Math.random() * 90 + 10).toString() +
            Math.floor(Math.random() * 90 + 10).toString();
        return `${date}-${time}-${random}`;
    }

    static generateAppTransactionReference(modPrefix = "REF", addProjectPrefix = true) {
        let ref = "";
        return `${ref}${modPrefix}-${TravelportAdapter.generateUniqueReferenceId()}`;
    }
    static async manageBlockTransaction(app_reference,bookingType,providerCode,ledgerData,reporting_to_id,postData) {
        const entity_user_id = postData.user_id;
        // Get Agent Balance
        const agentBalanceArr = await FlightModel.getAgentBalance(entity_user_id);
        const agentBalance = agentBalanceArr.balance;
        const agentBuyingFare = Number(ledgerData.agent);
        const agentClosingBalance = agentBalance - agentBuyingFare;
        // Prepare Transaction Log
        const agentLogs = {
            system_transaction_id: TravelportAdapter.generateAppTransactionReference(),
            transaction_type: "flight",
            opening_balance: Number(agentBalance),
            closing_balance: Number(agentClosingBalance),
            app_reference,
            fare: -agentBuyingFare,
            remarks: "Flight Booking",
            transaction_owner_id: entity_user_id,
            created_by_id: entity_user_id,
            created_datetime: new Date(),
            currency: "INR",
            currency_conversion_rate: 1,
        };

        // Deduct amount from wallet
        const rr = await FlightModel.modifyUserBalance(
            "b2b",
            entity_user_id,
            -agentBuyingFare
        );

        // Save transaction log
        await FlightModel.insertData('transaction_log',agentLogs);
        // Update booking transaction status
        await FlightModel.updateTransactionPaymentStatus(
            'flight',
            app_reference,
            "paid",
            agentBuyingFare
        );
        // if (bookingType.toLowerCase() === "confirm") {
            
        //     const currency = currency || 'INR';
        //     const currencyConversionRate = 1;
        //     const condition = `user_oid='${reporting_to_id}'`;
        //     selectData('dist_user_details', condition)
        //     if (ledgerData.dist && await checkDistDiStatus(entity_reporting_to_id) === 1) {

        //         const diTxt = ledgerData.dist > 0 ? "Credited" : "Debited";

        //         const distMarkupValue = Number(ledgerData.dist);

        //         const distBalance = await getDistributorBalance(entity_reporting_to_id);

        //         const distClosingBalance = distBalance + distMarkupValue;

        //         const distLogs = {
        //             system_transaction_id: this.generateAppTransactionReference(),
        //             transaction_type: "flight",
        //             opening_balance: distBalance,
        //             closing_balance: distClosingBalance,
        //             app_reference,
        //             fare: distMarkupValue,
        //             remarks: `Flight Booking Markup ${diTxt}`,
        //             transaction_owner_id: entity_reporting_to_id,
        //             created_by_id: entity_user_id,
        //             created_datetime: new Date(),
        //             currency: currency || "INR",
        //             currency_conversion_rate: currencyConversionRate
        //         };

        //         await modifyUserBalance(
        //             "dist",
        //             entity_reporting_to_id,
        //             distMarkupValue
        //         );

        //         await db.query(
        //             "INSERT INTO transaction_log SET ?",
        //             [distLogs]
        //         );

        //         // ================= Distributor DI =================

        //         const agentNetFare = Number(ledgerData.agent || 0);

        //         const getDistPercentage = await getDistPercentageById(
        //             entity_reporting_to_id,
        //             1
        //         );

        //         if (
        //             getDistPercentage &&
        //             getDistPercentage.status == 1 &&
        //             await checkDistDiStatus(entity_reporting_to_id) == 1
        //         ) {

        //             const newDistBalance =
        //                 await getDistributorBalance(entity_reporting_to_id);

        //             const fivePercent =
        //                 (agentNetFare * Number(getDistPercentage.di_percentage)) / 100;

        //             const twoPercentOfFiveTDS =
        //                 (fivePercent * 2) / 100;

        //             const agentDI =
        //                 fivePercent - twoPercentOfFiveTDS;

        //             const distClosingDIBalance =
        //                 newDistBalance + agentDI;

        //             const remarkTxt =
        //                 agentDI < 0 ? "Debited" : "Credited";

        //             const distDiLogs = {

        //                 system_transaction_id: generateAppTransactionReference(),

        //                 transaction_type: "flight",

        //                 opening_balance: newDistBalance,

        //                 closing_balance: distClosingDIBalance,

        //                 app_reference,

        //                 fare: agentDI,

        //                 remarks: `Flight Booking DI ${remarkTxt}`,

        //                 transaction_owner_id: entity_reporting_to_id,

        //                 created_by_id: entity_user_id,

        //                 created_datetime: new Date(),

        //                 currency: currency || "INR",

        //                 currency_conversion_rate: currencyConversionRate
        //             };

        //             await modifyUserBalance(
        //                 "dist",
        //                 entity_reporting_to_id,
        //                 agentDI
        //             );

        //             await db.query(
        //                 "INSERT INTO transaction_log SET ?",
        //                 [distDiLogs]
        //             );
        //         }
        //     }

        //     // ================= Agent =================

        //     const agentBalance =
        //         await getAgentBalance(entity_user_id);

        //     const agentBuyingFare =
        //         Number(ledgerData.agent);

        //     const agentClosingBalance =
        //         agentBalance + agentBuyingFare;

        //     const agentLogs = {

        //         system_transaction_id:
        //             generateAppTransactionReference(),

        //         transaction_type: "flight",

        //         opening_balance: agentBalance,

        //         closing_balance: agentClosingBalance,

        //         app_reference,

        //         fare: -agentBuyingFare,

        //         remarks: "Flight Booking",

        //         transaction_owner_id: entity_user_id,

        //         created_by_id: entity_user_id,

        //         created_datetime: new Date(),

        //         currency: currency || "INR",

        //         currency_conversion_rate: currencyConversionRate
        //     };

        //     await modifyUserBalance(
        //         "b2b",
        //         entity_user_id,
        //         -agentBuyingFare
        //     );

        //     await updateTransactionPaymentStatus(
        //         "flight",
        //         app_reference,
        //         "paid",
        //         agentBuyingFare
        //     );

        //     // Agar insert bhi karna hai to uncomment kar dein
        //     // await db.query("INSERT INTO transaction_log SET ?", [agentLogs]);

        //     await saveTransactionDetails(
        //         "flight",
        //         app_reference,
        //         -agentBuyingFare,
        //         0,
        //         0,
        //         "Flight Booking",
        //         entity_user_id,
        //         false,
        //         currency,
        //         currencyConversionRate
        //     );
        // }
    }
    static async validAirCreateReservationResponse(postData,respData,app_reference, providerCode,reporting_to_id) {
        try {
            const toArray = val => {
                if (val === undefined || val === null) return [];
                return Array.isArray(val) ? val : [val];
            };
            const body = respData?.['SOAP:Envelope']?.['SOAP:Body'] || {};
            const fault = body?.['SOAP:Fault'];
            if (fault) {
                throw new Error('Issue while booking!');
            }
            const booking_type = postData.booking_type;
            let bStatus = (booking_type === 'hold') ? 'BOOKING_HOLD' : 'BOOKING_CONFIRMED';

            const AirCreateReservationRsp = body?.['universal:AirCreateReservationRsp'] || {};
            const changedInfo = AirCreateReservationRsp?.['air:AirSolutionChangedInfo'] || {};
            if (AirCreateReservationRsp && ( ( providerCode === "1G" && !AirCreateReservationRsp['air:AirSolutionChangedInfo'] ) || providerCode === "ACH"  ) ) {

                const UniversalRecord = toArray(AirCreateReservationRsp?.['universal:UniversalRecord']);
                // if (!UniversalRecord.length) {
                //     return {
                //         status: 0,
                //         message: "Universal Record not found"
                //     };
                // }

                const ActionStatus = UniversalRecord[0]?.['common_v52_0:ActionStatus']?.$ || null;
                if (!ActionStatus) {
                    return {
                        status: 0,
                        message: "There is no action status found!"
                    };
                }

                const ProviderCode = ActionStatus?.ProviderCode || null;
                const ProviderReservationInfoMain = toArray(UniversalRecord[0]?.['universal:ProviderReservationInfo']);

                const ProviderReservationInfo = ProviderReservationInfoMain[0]?.$ || null;
                const ProviderLocatorCode = ProviderReservationInfo?.LocatorCode || null;
                const UniversalLocatorCode = UniversalRecord[0]?.$?.LocatorCode || "";

                // =========================================================
                // AIR RESERVATION
                // =========================================================
                const AirReservation =  UniversalRecord[0]?.["air:AirReservation"] || {};
                const AirPricingInfo = toArray(  AirReservation?.["air:AirPricingInfo"] );
                const air_pricing_keys = AirPricingInfo.map(info => info?.$?.Key).filter(Boolean);

                const supplierLocator = AirReservation?.["common_v52_0:SupplierLocator"]?.$ || {};
                const SupplierCode = supplierLocator?.SupplierCode || null;
                const SupplierLocatorCode = supplierLocator?.SupplierLocatorCode || null;
                const AirReservationLocatorCode = AirReservation?.$?.LocatorCode || null;

                // =========================================================
                // TCR / TICKETING INFO
                // =========================================================

                const TCRInfoArr = toArray(AirReservation?.["air:DocumentInfo"]?.["air:TCRInfo"] );

                let tcrNumber = null;
                let ticketingStatus = null;
                if (TCRInfoArr.length > 0) {
                    const tcr = TCRInfoArr[0]?.$ || {};
                    tcrNumber = tcr?.TCRNumber || null;
                    ticketingStatus = tcr?.Status || null;
                }

                // =========================================================
                // BOOKING DETAILS UPDATE
                // =========================================================

                const bookingdetails = {
                    booking_status: bStatus,
                    data: null,
                    updated_at: new Date(),
                };

                const FBDcondition =
                    `app_reference='${app_reference}'`;

                await FlightModel.updateData(
                    "flight_booking_details",
                    bookingdetails,
                    FBDcondition
                );

                // =========================================================
                // TRANSACTION DETAILS UPDATE
                // =========================================================

                const transactionDetailsData = {
                    pnr: SupplierLocatorCode || null,
                    status: bStatus,
                };

                const FBTDcondition =
                    `app_reference='${app_reference}'`;

                await FlightModel.updateData(
                    "flight_booking_transaction_details",
                    transactionDetailsData,
                    FBTDcondition
                );

                // =========================================================
                // PASSENGER UPDATE
                // =========================================================

                const allBookingTravelers = [];

                UniversalRecord.forEach(record => {

                    if (record["common_v52_0:BookingTraveler"]) {

                        const btArr = toArray(
                            record["common_v52_0:BookingTraveler"]
                        );

                        allBookingTravelers.push(...btArr);
                    }
                });

                for (const bt of allBookingTravelers) {

                    try {

                        const attr = bt.$ || {};

                        const nameObj =
                            bt["common_v52_0:BookingTravelerName"]?.$ || {};

                        const title = nameObj.Prefix;
                        const first_name = nameObj.First;
                        const last_name = nameObj.Last;

                        const insertPax = {
                            booking_status: bStatus,
                            ticket_no: tcrNumber || null,
                        };

                        const FBPDcondition = `
                            app_reference='${app_reference}'
                            AND first_name='${first_name}'
                            AND last_name='${last_name}'
                        `;

                        await FlightModel.updateData(
                            "flight_booking_passenger_details",
                            insertPax,
                            FBPDcondition
                        );

                    } catch (paxError) {

                        console.error(
                            `[${app_reference}] Passenger update error:`,
                            paxError
                        );

                        throw paxError;
                    }
                }

                // =========================================================
                // ITINERARY UPDATE
                // =========================================================

                const allSegments = [];

                UniversalRecord.forEach(record => {

                    const airRes =
                        record["air:AirReservation"];

                    if (
                        airRes &&
                        airRes["air:AirSegment"]
                    ) {

                        const segArr = toArray(
                            airRes["air:AirSegment"]
                        );

                        allSegments.push(...segArr);
                    }
                });

                for (const seg of allSegments) {

                    const attr = seg?.$ || {};

                    const insertItineraryObj = {
                        status: bStatus,
                        airline_pnr: SupplierLocatorCode || null,
                    };

                    const FBIDcondition =
                        `app_reference='${app_reference}'`;

                    await FlightModel.updateData(
                        "flight_booking_itinerary_details",
                        insertItineraryObj,
                        FBIDcondition
                    );
                }

                // =========================================================
                // TICKETING DATE
                // =========================================================

                const createDate =
                    AirReservation?.$?.CreateDate || null;

                const ticketDate =
                    ActionStatus?.TicketDate || null;

                const actionStatus =
                    ActionStatus?.Type || null;

                let ticketingDate = null;
                let lastTicketingDate = null;

                if (createDate) {

                    ticketingDate =
                        new Date(createDate)
                            .toISOString()
                            .slice(0, 16)
                            .replace("T", " ");
                }

                if (ticketDate) {

                    lastTicketingDate =
                        new Date(ticketDate)
                            .toISOString()
                            .slice(0, 16)
                            .replace("T", " ");
                }

                // =========================================================
                // ADDITIONAL DETAILS INSERT
                // =========================================================

                const addlInsertData = {

                    app_reference: app_reference,
                    booking_status: bStatus,
                    api_action_status: actionStatus || null,
                    supp_locator_code: SupplierLocatorCode || null,
                    pro_locator_code: ProviderLocatorCode || null,
                    uni_locator_code: UniversalLocatorCode || null,
                    air_locator_code: AirReservationLocatorCode || null,
                    pro_code: ProviderCode || null,
                    supp_code: SupplierCode || null,
                    tcr_num: tcrNumber || null,
                    tickiting_status: ticketingStatus || null,
                    tickiting_date: ticketingDate || null,
                    last_tickiting_date: lastTicketingDate || null,
                    created_by_id: 1,
                    tickited_by_id: 1,
                    created_datetime: new Date(),
                    tickited_datetime: ticketingDate || null,
                };

                await FlightModel.insertData(
                    "flight_booking_online_additional_details",
                    addlInsertData
                );

                // =========================================================
                // HOLD BOOKING
                // =========================================================
                

                if (booking_type === 'hold') {

                    return {
                        status: 1,
                        message: "Booking Hold Successfully"
                    };
                }

                // =========================================================
                // ACH BOOKING
                // =========================================================
                /*
                * ACH ke case me ticketing request nahi chalti.
                *
                * Isliye jo initial bStatus hai wahi final status hai.
                */

                if (providerCode === "ACH") {

                    if (bStatus === 'BOOKING_HOLD') {

                        return {
                            status: 1,
                            message: "Booking Hold Successfully"
                        };

                    } else {

                        return {
                            status: 1,
                            message: "Ticket Booking successfully!"
                        };
                    }
                }

                // =========================================================
                // GET ADDITIONAL DATA
                // =========================================================

                const addData =
                    await this.getAdditionalData(app_reference);

                if (!addData) {

                    throw new Error(
                        'Additional booking data not found'
                    );
                }

                // =========================================================
                // RETRIEVE RESERVATION
                // =========================================================

                const xmlUrRequest =
                    await RetrieveReservationRequest(
                        app_reference,
                        addData.pro_locator_code,
                        addData.pro_code,
                        addData.supp_code
                    );

                const [UrRtriveRes] =
                    await Promise.allSettled([
                        processRequest(
                            xmlUrRequest,
                            '',
                            true
                        )
                    ]);

                if (UrRtriveRes.status === 'rejected') {

                    console.error(
                        `[${app_reference}] Retrieve Reservation Error:`,
                        UrRtriveRes.reason
                    );

                    throw UrRtriveRes.reason;
                }

                await FlightModel.flight_xml_log(
                    app_reference,
                    xmlUrRequest,
                    UrRtriveRes.value,
                    "Travelport Retrive Reservation NODE"
                );

                // =========================================================
                // 1G TICKETING
                // =========================================================
                /*
                * Yahan sirf NON-HOLD 1G booking aayegi.
                *
                * HOLD booking upar hi return ho chuki hai.
                */

                const xmlTicketingRequest =
                    await TicketingRequest(
                        app_reference,
                        addData.pro_locator_code,
                        air_pricing_keys
                    );

                const [TicketingRsp] =
                    await Promise.allSettled([
                        processRequest(
                            xmlTicketingRequest,
                            '',
                            true
                        )
                    ]);

                // =========================================================
                // TICKETING REQUEST FAILED
                // =========================================================

                if (TicketingRsp.status === 'rejected') {

                    console.error(
                        `[${app_reference}] Ticketing Request Error:`,
                        TicketingRsp.reason
                    );

                    bStatus = 'BOOKING_HOLD';

                } else {

                    await FlightModel.flight_xml_log(
                        app_reference,
                        xmlTicketingRequest,
                        TicketingRsp.value,
                        "Travelport Ticketing Request NODE"
                    );

                    // =====================================================
                    // PARSE TICKETING RESPONSE
                    // =====================================================

                    const ticketResponse =
                        await xml2js.parseStringPromise(
                            TicketingRsp.value,
                            {
                                explicitArray: false
                            }
                        ).catch(error => {

                            console.error(
                                `[${app_reference}] Ticket XML Parse Error:`,
                                error
                            );

                            return null;
                        });

                    const ticketResponseBody =
                        ticketResponse?.['SOAP:Envelope']?.['SOAP:Body'];

                    const airTicketingRsp =
                        ticketResponseBody?.['air:AirTicketingRsp'];

                    let ticketFound = false;

                    // =====================================================
                    // CHECK TICKET RESPONSE
                    // =====================================================

                    if (airTicketingRsp) {

                        let etrs =
                            airTicketingRsp['air:ETR'];

                        etrs = etrs
                            ? (Array.isArray(etrs) ? etrs : [etrs])
                            : [];

                        for (const etr of etrs) {

                            if (!etr) continue;

                            const bookingTraveler =
                                etr[
                                    'common_v52_0:BookingTraveler'
                                ];

                            const bookingTravelerName =
                                bookingTraveler?.[
                                    'common_v52_0:BookingTravelerName'
                                ];

                            const firstName =
                                bookingTravelerName?.$?.First;

                            const lastName =
                                bookingTravelerName?.$?.Last;

                            const ticket =
                                etr['air:Ticket'];

                            const ticketNumber =
                                ticket?.$?.TicketNumber;

                            /*
                            * Ticket number nahi mila
                            */

                            if (!ticketNumber) {

                                console.error(
                                    `[${app_reference}] Ticket number not found for ${firstName} ${lastName}`
                                );

                                continue;
                            }

                            /*
                            * Ticket number mil gaya
                            */

                            ticketFound = true;

                            // =================================================
                            // PASSENGER TICKET UPDATE
                            // =================================================

                            const condition1G = {
                                app_reference: app_reference,
                                first_name: firstName,
                                last_name: lastName
                            };

                            await FlightModel.updateData(
                                "flight_booking_passenger_details",
                                {
                                    ticket_no: ticketNumber
                                },
                                condition1G
                            );

                            // =================================================
                            // ADDITIONAL DETAILS TICKET UPDATE
                            // =================================================

                            const conditionAdditional = {
                                app_reference: app_reference
                            };

                            await FlightModel.updateData(
                                "flight_booking_online_additional_details",
                                {
                                    tcr_num: ticketNumber
                                },
                                conditionAdditional
                            );
                        }

                    } else {

                        console.error(
                            `[${app_reference}] AirTicketingRsp not found in ticket response`
                        );
                    }

                    // =====================================================
                    // FINAL STATUS BASED ON TICKET NUMBER
                    // =====================================================

                    if (ticketFound) {

                        bStatus = 'BOOKING_CONFIRMED';

                    } else {

                        bStatus = 'BOOKING_HOLD';
                    }
                }

                // =========================================================
                // FINAL STATUS UPDATE
                // =========================================================
                /*
                * 1G NON-HOLD:
                *
                * Ticket number mila:
                *      BOOKING_CONFIRMED
                *
                * Ticket number nahi mila:
                *      BOOKING_HOLD
                */

                // =========================================================
                // BOOKING DETAILS
                // =========================================================

                await FlightModel.updateData(
                    "flight_booking_details",
                    {
                        booking_status: bStatus,
                        updated_at: new Date()
                    },
                    `app_reference='${app_reference}'`
                );

                // =========================================================
                // TRANSACTION DETAILS
                // =========================================================

                await FlightModel.updateData(
                    "flight_booking_transaction_details",
                    {
                        status: bStatus
                    },
                    {
                        app_reference: app_reference
                    }
                );

                // =========================================================
                // PASSENGER DETAILS
                // =========================================================

                await FlightModel.updateData(
                    "flight_booking_passenger_details",
                    {
                        booking_status: bStatus
                    },
                    {
                        app_reference: app_reference
                    }
                );

                // =========================================================
                // ITINERARY DETAILS
                // =========================================================

                await FlightModel.updateData(
                    "flight_booking_itinerary_details",
                    {
                        status: bStatus
                    },
                    {
                        app_reference: app_reference
                    }
                );

                // =========================================================
                // ADDITIONAL DETAILS
                // =========================================================

                await FlightModel.updateData(
                    "flight_booking_online_additional_details",
                    {
                        booking_status: bStatus
                    },
                    {
                        app_reference: app_reference
                    }
                );

                // =========================================================
                // FINAL RESPONSE
                // =========================================================

                if (bStatus === 'BOOKING_HOLD') {

                    return {
                        status: 1,
                        message: "Booking Hold Successfully"
                    };
                }

                return {
                    status: 1,
                    message: "Ticket Booking successfully!"
                };

            } else {

                console.error(
                    `[${app_reference}] AirCreateReservation API validation failed`
                );

                return {
                    status: 0,
                    message: "issue while ticket booking",
                    error: "Api error!"
                };
            }

        } catch (error) {

            console.error(
                `\n========== AIR CREATE RESERVATION ERROR ==========\n` +
                `Error Message: ${error?.message || error}\n` +
                `Error Stack: ${error?.stack || 'No stack'}\n` +
                `=================================================\n`
            );

            return {
                status: 0,
                message: "Issue while processing booking",
                error: error?.message || "Unknown error"
            };
        }
    }
    static async validAirCreateReservationResponse_bkp15092026(postData,respData,app_reference,providerCode,reporting_to_id) {
        try {
            const toArray = val => {
                if (val === undefined || val === null) return [];
                return Array.isArray(val) ? val : [val];
            };
            const body = respData?.['SOAP:Envelope']?.['SOAP:Body'] || {};
            const fault = body?.['SOAP:Fault'];
            if (fault) {
                throw new Error('Issue while booking!');
            }

            const booking_type = postData.booking_type;
            const bStatus = (booking_type == 'hold')? 'BOOKING_HOLD': 'BOOKING_CONFIRMED';
            const AirCreateReservationRsp =
                body?.['universal:AirCreateReservationRsp'] || {};
            const changedInfo =
                AirCreateReservationRsp?.['air:AirSolutionChangedInfo'] || {};
            if (AirCreateReservationRsp && ((providerCode === "1G" && !AirCreateReservationRsp['air:AirSolutionChangedInfo']) || providerCode === "ACH" )) {

                const UniversalRecord = toArray(
                    AirCreateReservationRsp?.['universal:UniversalRecord']
                );
                if (!UniversalRecord.length) {
                    return {
                        status: 0,
                        message: "Universal Record not found"
                    };
                }
                const ActionStatus = UniversalRecord[0]?.['common_v52_0:ActionStatus']?.$ || null;
                if (!ActionStatus) {
                    return {
                        status: 0,
                        message: "There is no action status found!"
                    };
                }
                const ProviderCode = ActionStatus?.ProviderCode || null;
                const ProviderReservationInfoMain = toArray(UniversalRecord[0]?.['universal:ProviderReservationInfo'] );
                const ProviderReservationInfo = ProviderReservationInfoMain[0]?.$ || null;
                const ProviderLocatorCode = ProviderReservationInfo?.LocatorCode || null;
                const UniversalLocatorCode = UniversalRecord[0]?.$?.LocatorCode || "";

                // =========================================================
                // AIR RESERVATION 
                // =========================================================

                const AirReservation = UniversalRecord[0]?.["air:AirReservation"] || {};
                const AirPricingInfo = toArray(AirReservation?.["air:AirPricingInfo"]);
                const air_pricing_keys = AirPricingInfo.map(info => info?.$?.Key).filter(Boolean);
                const supplierLocator = AirReservation?.["common_v52_0:SupplierLocator"]?.$ || {};
                const SupplierCode = supplierLocator?.SupplierCode || null;
                const SupplierLocatorCode = supplierLocator?.SupplierLocatorCode || null;
                const AirReservationLocatorCode = AirReservation?.$?.LocatorCode || null;

                // =========================================================
                // TCR / TICKETING INFO
                // =========================================================

                const TCRInfoArr = toArray(AirReservation?.["air:DocumentInfo"]?.["air:TCRInfo"]);

                let tcrNumber = null;
                let ticketingStatus = null;
                if (TCRInfoArr.length > 0) {
                    const tcr = TCRInfoArr[0]?.$ || {};
                    tcrNumber = tcr?.TCRNumber || null;
                    ticketingStatus = tcr?.Status || null;
                }

                // =========================================================
                // BOOKING DETAILS UPDATE
                // =========================================================
                const bookingdetails = { booking_status: bStatus,data: null,updated_at: new Date(),};
                const FBDcondition = `app_reference='${app_reference}'`;
                await FlightModel.updateData("flight_booking_details",bookingdetails,FBDcondition);

                // =========================================================
                // TRANSACTION DETAILS UPDATE
                // =========================================================

                const transactionDetailsData = {pnr: SupplierLocatorCode || null,status: bStatus,};
                const FBTDcondition = `app_reference='${app_reference}'`;
                await FlightModel.updateData( "flight_booking_transaction_details",transactionDetailsData, FBTDcondition );

                // =========================================================
                // PASSENGER UPDATE
                // =========================================================
                const allBookingTravelers = [];
                UniversalRecord.forEach(record => {
                    if (record["common_v52_0:BookingTraveler"]) {
                        const btArr = toArray(
                            record["common_v52_0:BookingTraveler"]
                        );
                        allBookingTravelers.push(...btArr);
                    }
                });

                for (const bt of allBookingTravelers) {
                    try {
                        const attr = bt.$ || {};
                        const nameObj = bt["common_v52_0:BookingTravelerName"]?.$ || {};

                        const title = nameObj.Prefix;
                        const first_name = nameObj.First;
                        const last_name = nameObj.Last;

                        const insertPax = {
                            booking_status: bStatus,
                            ticket_no: tcrNumber || null,
                        };

                        const FBPDcondition = `
                            app_reference='${app_reference}'
                            AND first_name='${first_name}'
                            AND last_name='${last_name}'
                        `;

                        await FlightModel.updateData(
                            "flight_booking_passenger_details",
                            insertPax,
                            FBPDcondition
                        );

                    } catch (paxError) {
                        console.error(
                            `[${app_reference}] Passenger update error:`,
                            paxError
                        );
                        throw paxError;
                    }
                }

                // =========================================================
                // ITINERARY UPDATE
                // =========================================================
                const allSegments = [];
                UniversalRecord.forEach(record => {
                    const airRes = record["air:AirReservation"];
                    if (airRes && airRes["air:AirSegment"]) {
                        const segArr = toArray(
                            airRes["air:AirSegment"]
                        );
                        allSegments.push(...segArr);
                    }
                });

                for (const seg of allSegments) {
                    const attr = seg?.$ || {};
                    const insertItineraryObj = {
                        status: bStatus,
                        airline_pnr: SupplierLocatorCode || null,
                    };
                    const FBIDcondition = `app_reference='${app_reference}'`;
                    await FlightModel.updateData("flight_booking_itinerary_details",insertItineraryObj,FBIDcondition);
                }

                // =========================================================
                // TICKETING DATE
                // =========================================================

                const createDate = AirReservation?.$?.CreateDate || null;
                const ticketDate = ActionStatus?.TicketDate || null;
                const actionStatus = ActionStatus?.Type || null;

                let ticketingDate = null;
                let lastTicketingDate = null;
                if (createDate) {
                    ticketingDate = new Date(createDate).toISOString().slice(0, 16).replace("T", " ");
                }
                if (ticketDate) {
                    lastTicketingDate = new Date(ticketDate).toISOString().slice(0, 16).replace("T", " ");
                }

                // =========================================================
                // ADDITIONAL DETAILS INSERT
                // =========================================================

                const addlInsertData = {
                    app_reference: app_reference,
                    booking_status: bStatus,
                    api_action_status: actionStatus || null,
                    supp_locator_code: SupplierLocatorCode || null,
                    pro_locator_code: ProviderLocatorCode || null,
                    uni_locator_code: UniversalLocatorCode || null,
                    air_locator_code: AirReservationLocatorCode || null,
                    pro_code: ProviderCode || null,
                    supp_code: SupplierCode || null,
                    tcr_num: tcrNumber || null,
                    tickiting_status: ticketingStatus || null,
                    tickiting_date: ticketingDate || null,
                    last_tickiting_date: lastTicketingDate || null,
                    created_by_id: 1,
                    tickited_by_id: 1,
                    created_datetime: new Date(),
                    tickited_datetime: ticketingDate || null,
                };

                const addID = await FlightModel.insertData("flight_booking_online_additional_details", addlInsertData);

                // =========================================================
                // BOOKING HOLD / PENDING
                // =========================================================

                if (!ticketingStatus || ticketingStatus?.toLowerCase() !== 'confirmed') {
                    const rMsg = (booking_type == 'hold') ? 'Booking Hold Successfully' : 'Booking Pending Successfully';
                    return {
                        status: 1,
                        message: rMsg
                    };
                }
                // =========================================================
                // GET ADDITIONAL DATA
                // =========================================================

                const addData = await this.getAdditionalData(app_reference);
                if (!addData) {
                    throw new Error(
                        'Additional booking data not found'
                    );
                }

                // =========================================================
                // RETRIEVE RESERVATION
                // =========================================================

                const xmlUrRequest = await RetrieveReservationRequest(app_reference,addData.pro_locator_code,addData.pro_code,addData.supp_code);
                const [UrRtriveRes] =
                    await Promise.allSettled([
                        processRequest(xmlUrRequest,'',true)
                    ]);
                if (UrRtriveRes.status === 'rejected') {
                    console.error(
                        `[${app_reference}] Retrieve Reservation Error:`,
                        UrRtriveRes.reason
                    );
                    throw UrRtriveRes.reason;
                }

                const acrLogId = await FlightModel.flight_xml_log(app_reference,xmlUrRequest,UrRtriveRes.value,"Travelport Retrive Reservation NODE");

                // =========================================================
                // 1G TICKETING
                // =========================================================

                if (addData.pro_code?.toLowerCase() != 'ach' && booking_type != 'hold') {
                    const xmlTicketingRequest = await TicketingRequest(app_reference,addData.pro_locator_code,air_pricing_keys);
                    const [TicketingRsp] = await Promise.allSettled([processRequest(xmlTicketingRequest,'',true)]);

                    if (TicketingRsp.status === 'rejected') {
                        console.error(
                            `[${app_reference}] Ticketing Request Error:`,
                            TicketingRsp.reason
                        );
                        throw TicketingRsp.reason;
                    }

                    await FlightModel.flight_xml_log(app_reference,xmlTicketingRequest,TicketingRsp.value, "Travelport Ticketing Request NODE");
                    // =====================================================
                    // PARSE TICKETING RESPONSE
                    // =====================================================
                    const ticketResponse =
                        await xml2js.parseStringPromise(TicketingRsp.value,{explicitArray: false}
                        ).catch(error => {
                            console.error(
                                `[${app_reference}] Ticket XML Parse Error:`,
                                error
                            );
                            throw new Error(
                                'Unable to parse ticketing response'
                            );
                        });

                    const ticketResponseBody = ticketResponse?.['SOAP:Envelope']?.['SOAP:Body'];
                    const airTicketingRsp = ticketResponseBody?.['air:AirTicketingRsp'];
                    if (!airTicketingRsp) {
                        throw new Error(
                            'AirTicketingRsp not found in ticket response'
                        );
                    }
                    let etrs = airTicketingRsp['air:ETR'];
                    etrs = Array.isArray(etrs) ? etrs : [etrs];
                    for (const etr of etrs) {
                        if (!etr) continue;
                        const bookingTraveler = etr['common_v52_0:BookingTraveler'];
                        const bookingTravelerName = bookingTraveler?.['common_v52_0:BookingTravelerName'];
                        const firstName = bookingTravelerName?.$?.First;
                        const lastName = bookingTravelerName?.$?.Last;
                        const ticket =  etr['air:Ticket'];
                        const ticketNumber = ticket?.$?.TicketNumber;

                        if (!ticketNumber) {
                            console.error(
                                `[${app_reference}] Ticket number not found for ${firstName} ${lastName}`
                            );
                            continue;
                        }
                        
                        const condition1G = { app_reference: app_reference,first_name: firstName,last_name: lastName};
                        await FlightModel.updateData("flight_booking_passenger_details",{ticket_no: ticketNumber}, condition1G);

                        const conditionAdditional = {app_reference: app_reference};
                        await FlightModel.updateData("flight_booking_online_additional_details",{tcr_num: ticketNumber},conditionAdditional);
                    }
                }

                // =========================================================
                // SUCCESS
                // =========================================================

                return {
                    status: 1,
                    message: "Ticket Booking successfully!"
                };

            } else {

                console.error(
                    `[${app_reference}] AirCreateReservation API validation failed`
                );

                return {
                    status: 0,
                    message: "issue while ticket booking",
                    error: "Api error!"
                };
            }

        } catch (error) {
            console.error(
                `\n========== AIR CREATE RESERVATION ERROR ==========\n` +
                `Error Message: ${error?.message || error}\n` +
                `Error Stack: ${error?.stack || 'No stack'}\n` +
                `=================================================\n`
            );
            return {
                status: 0,
                message: "Issue while processing booking",
                error: error?.message || "Unknown error"
            };
        }
    }
    

    async HoldToConfirm(postData) {
        const toArray = val => Array.isArray(val) ? val : [val];
        const authModel = require('../../profile/models/auth.models');
        const app_reference = postData.app_reference;
        const user_id = postData.user_id;
        const getAgentBalance = await authModel.getAgentbalance(user_id);
        let agentBalance = 0;

        if (getAgentBalance.length > 0 && getAgentBalance[0].wallet_balance > 0) {
            agentBalance = getAgentBalance[0].wallet_balance;
        }
        if (app_reference == undefined) {
            throw {
                status: 500,
                message: 'invalid detail!',
                error: 'invalid detail!'
            };
        }
        try {
            let erroMsg = '';
            const dbPool = require("../../database/db1");
            const connection = await dbPool.getConnection();
            const bookingDetails = await FlightModel.BookingDetailByAppReference(connection, app_reference);

            if (bookingDetails?.data?.booking_status == 'BOOKING_HOLD') {
                
                if (agentBalance >= bookingDetails?.data?.total_fare) {
                    
                    const addData = bookingDetails.data;
                    const api_final_fare = addData.api_total_fare;
                    const provider_locator_code = addData.pro_locator_code;
                    const xmlUrRequest = await RetrieveReservationRequest(app_reference, addData.pro_locator_code, addData.pro_code, addData.supp_code);

                    const [UrRtriveRes] = await Promise.allSettled([
                        processRequest(xmlUrRequest, '', true)
                    ]);
                    const acrLogId = await FlightModel.flight_xml_log(app_reference, xmlUrRequest, UrRtriveRes.value, "Travelport Retrive Reservation NODE");
                    const jsonData = await xml2js.parseStringPromise(UrRtriveRes.value, { explicitArray: false }).catch(() => null);
                    const body = jsonData?.['SOAP:Envelope']?.['SOAP:Body'] || {};
                    const fault = body?.['SOAP:Fault'];
                    if (fault) {
                        throw new Error('Flight list not found!');
                    }

                    const universalRecordArr =
                        body?.['universal:UniversalRecordRetrieveRsp']?.['universal:UniversalRecord'] || {};
                    const airReservation = universalRecordArr?.['air:AirReservation'] || {};
                    const airPriceInfoRaw = airReservation?.['air:AirPricingInfo'] || [];
                    const airPriceInfoArr = Array.isArray(airPriceInfoRaw)
                        ? airPriceInfoRaw
                        : [airPriceInfoRaw];

                    const universalRecordAttr = universalRecordArr?.$ || {};

                    const version = universalRecordAttr?.Version || '';
                    const universallocatorCode = universalRecordAttr?.LocatorCode || '';
                    const resLocatorCode = airReservation?.$?.LocatorCode || '';
                    let airPriceRef = [];
                    airPriceInfoArr.forEach((airPriceInfo) => {
                        const airPriceInfoAttr = airPriceInfo?.$ || {};
                        const priceRef = airPriceInfoAttr?.Key || '';
                        if (priceRef) {
                            //airPriceRef += `<air:AirPricingInfoRef Key="${priceRef}"/>`;
                            airPriceRef.push(priceRef);
                        }
                    });
                
                    const htcReq = await HoldToConfirmRequest(app_reference, universallocatorCode, provider_locator_code, addData.pro_code, resLocatorCode, airPriceRef, api_final_fare, version);
                  
                    const [HtcResponse] = await Promise.allSettled([
                        processRequest(htcReq, '', true)
                    ]);
        
                    await FlightModel.flight_xml_log(app_reference, htcReq, HtcResponse.value, "Hold To Confirm NODE");
                    const HtcResponseData = await xml2js.parseStringPromise(HtcResponse.value, { explicitArray: false }).catch(() => null);
                    const HtcResponseDataBody = HtcResponseData?.['SOAP:Envelope']?.['SOAP:Body'] || {};
                    const Htcfault = HtcResponseDataBody?.['SOAP:Fault'];
                   
                    if (Htcfault) {
                        throw new Error('issue with the booking please check the report!');
                    }
                    const UniversalRecordModifyRsp = HtcResponseDataBody?.['universal:UniversalRecordModifyRsp'];
                    const bookingStatus = 'BOOKING_CONFIRMED';
                    const message = 'Your booking is Confirmed';

                    if (addData.pro_code?.toLowerCase() != 'ach') {
                        const xmlTicketingRequest = await TicketingRequest(app_reference, addData.pro_locator_code, air_pricing_keys);

                        const [TicketingRsp] = await Promise.allSettled([
                            processRequest(xmlTicketingRequest, '', true)
                        ]);
                        await FlightModel.flight_xml_log(app_reference, xmlTicketingRequest, TicketingRsp.value, "Travelport Ticketing Request NODE");
                        const ticketResponse = await xml2js.parseStringPromise(TicketingRsp.value, { explicitArray: false }).catch(() => null);

                        const ticketResponseBody = ticketResponse['SOAP:Envelope']['SOAP:Body'];
                        const airTicketingRsp = ticketResponseBody['air:AirTicketingRsp'];

                        let etrs = airTicketingRsp['air:ETR'];
                        etrs = Array.isArray(etrs) ? etrs : [etrs];
                        for (const etr of etrs) {
                            const bookingTraveler = etr['common_v52_0:BookingTraveler'];
                            const firstName = bookingTraveler['common_v52_0:BookingTravelerName']['$'].First;
                            const lastName = bookingTraveler['common_v52_0:BookingTravelerName']['$'].Last;

                            const ticket = etr['air:Ticket'];
                            const ticketNumber = ticket['$'].TicketNumber;
                            const condition1G = {
                                app_reference: app_reference,
                                first_name: firstName,
                                last_name: lastName
                            };

                            await FlightModel.updateData("flight_booking_passenger_details", { ticket_no: ticketNumber }, condition1G);
                            const FBDoadcondition = `app_reference='${app_reference}'`;
                            const FBDoadData = { booking_status: bookingStatus };
                            await FlightModel.updateData("flight_booking_details", FBDoadData, FBDoadcondition);

                            const conditionAdditional = { app_reference: app_reference };
                            await FlightModel.updateData("flight_booking_online_additional_details", { tcr_num: ticketNumber }, conditionAdditional);

                        }
                         return { status: 1, message: message };
                    } else {

                        const tcrNo = UniversalRecordModifyRsp?.['universal:UniversalRecord']['air:AirReservation']['air:DocumentInfo']['air:TCRInfo']?.$?.['TCRNumber'];
                        const FBtcondition = `app_reference='${app_reference}'`;
                        const FBtData = { ticket_no: tcrNo, payment_status: 'paid', };
                        let upd = await FlightModel.updateData("flight_booking_transaction_details", FBtData, FBtcondition);

                        const FBpdcondition = `app_reference='${app_reference}'`;
                        const FBpdData = { ticket_no: tcrNo, status: bookingStatus, booking_status: bookingStatus };
                        await FlightModel.updateData("flight_booking_passenger_details", FBpdData, FBpdcondition);

                        const FBoadcondition = `app_reference='${app_reference}'`;
                        const FBoadData = { tcr_num: tcrNo, booking_status: bookingStatus };
                        await FlightModel.updateData("flight_booking_online_additional_details", FBoadData, FBoadcondition);

                        const FBDoadcondition = `app_reference='${app_reference}'`;
                        const FBDoadData = { booking_status: bookingStatus };
                        await FlightModel.updateData("flight_booking_details", FBDoadData, FBDoadcondition);
                        return { status: 1, message: message };
                    }
                } else {
                    erroMsg = 'Your balance is insufficient.Please try again.';
                }

            } else {
                erroMsg = 'Booking detail not find.Please try again.';
            }
            throw {
                status: 500,
                message: erroMsg,
                error: erroMsg
            };
        } catch (error) {
    //         console.log(error);
    // console.log(error.stack);
    // throw error;
            throw {
                status: 500,
                message: 'Booking Detail Not Found!.Api Error.',
                error: 'Booking Detail Not Found!.Api Error.'
            };
        }
    }

    async GetHoldBookingDetail(postData){
        
        const app_reference = postData.app_reference;
        
        if (app_reference == undefined) {
            throw {
                status: 500,
                message: 'invalid detail!',
                error: 'invalid detail!'
            };
        }
        try {
            let erroMsg = '';
            const bookingDetails = await FlightModel.getFlightHoldDetails( app_reference);
            
            return { status: bookingDetails.status, message: bookingDetails.message,data:bookingDetails.data };
            
        } catch (error) {
            throw {
                status: 500,
                message: 'Booking Detail Not Found!.Api Error.',
                error: 'Booking Detail Not Found!.Api Error.'
            };
        }
    }
    async unprocessTicket(postData){
        const app_reference = postData.app_reference;
        const msg = 'Something went wrong.Please try again later.';
        if (app_reference == undefined) {
            throw {
                status: 0,
                message: 'Ticket Detail Not Found!.Api Error.',
                error: 'Ticket Detail Not Found!.Api Error.'
            };
        }
        try {
            let erroMsg = '';
            const condition = `app_reference='${app_reference}'`;
            const data = await FlightModel.selectData( 'flight_booking_details',condition,'status');
            if (!data || !data.result || data.result.length === 0){
                throw {
                    status: 0,
                    message: 'Ticket Detail Not Found!.Api Error.',
                    error: 'Ticket Detail Not Found!.Api Error.'
                };
            }
            const nstatus = data.result[0].status;
            if(nstatus == 'newtp'){
                const BDData = { booking_status: 'BOOKING_CANCELLED'};
                const FBTDcondition = `app_reference='${app_reference}'`;
                const rr = await FlightModel.updateData("flight_booking_details", BDData, FBTDcondition);
                
            }else{
                const BDData = { booking_status: 'CANCELLED'};
                const FBTDcondition = `app_reference='${app_reference}'`;
                await FlightModel.updateData("flight_booking_details", BDData, FBTDcondition);
            }
            const FBTDcondition = `app_reference='${app_reference}'`;
            await FlightModel.deleteData("flight_hold_booking_params", FBTDcondition);
            
            return { status: 1, message: 'Your hold ticket has been deleted.'};
            
        } catch (error) {
            throw {
                status: 0,
                message: msg,
                error: msg
            };
        }
    }

    static formatGender(gender) {
        if (!gender) return "";
        const g = gender.toUpperCase().trim();
        switch (g) {
            case "M": return "Male";
            case "F": return "Female";
            default: return "Others";
        }
    }
    static formatPassengerType(type) {
        if (!type) return "";
        type = type.toUpperCase();
        if (type === "ADT") return "Adult";
        if (type === "CHD") return "Child";
        if (type === "CNN") return "Child";
        if (type === "INF") return "Infant";
        return type;
    }
    static generateFlightPriceId(priceKey) {
        return 'DFS' + require('crypto').createHash('md5').update(priceKey).digest('hex');
    }
    async MarcupCalculation(PaxCount, TotalPrice, BasePrice) {

        const BaseFare = BasePrice;
        const GrossFare = TotalPrice;
        const Fee = 0;

        const AdminDistMarkup = 10;
        const DiOnBaseFare = 3.5;
        const DiOnGrossFare = 0.25;
        const MonthPLB = 0.75;
        const QuaterPLB = 0.25;
        const YearlyPLB = 0.25;
        const ItntlPLB = 0.75;
        const FUELCHARGE = 0;

        const INC = Math.round((BasePrice + FUELCHARGE) * (MonthPLB + QuaterPLB + YearlyPLB) / 100);

        const TTF = (BaseFare * DiOnBaseFare) / 100;
        const RCF = Math.round(((GrossFare - Fee) * DiOnGrossFare) / 100);

        const ASF = Math.round((BaseFare * MonthPLB) / 100);
        const PHF = Math.round((BaseFare * QuaterPLB) / 100);
        const UDF = Math.round((BaseFare * ItntlPLB) / 100);
        const GST = Math.round((BaseFare * DiOnBaseFare) / 100);

        const MGMNTFEE = 0;
        const GSTonMGMNTFEE = 0;

        let UpdateFare = 0;
        const AdminAmnt = Math.round((BaseFare * AdminDistMarkup) / 100);

        UpdateFare = UpdateFare + AdminAmnt;
        UpdateFare = UpdateFare * PaxCount;

        let ShowingFare = GrossFare - TTF + MGMNTFEE + GSTonMGMNTFEE - RCF;
        let NetFare = ShowingFare - INC;

        ShowingFare = ShowingFare + UpdateFare;
        NetFare = NetFare + UpdateFare;

        return {
            NetFare,
            ShowingFare,
            INC
        };
    }
    static async getAirportCity(code) {
        const condition = `airport_code='${code}'`;
        const data = await FlightModel.selectData("flight_airport_list", condition);
        if (!data || !data.result || data.result.length === 0) return code;
        const airportCity = data.result[0].airport_city;
        const airportCode = data.result[0].airport_code;
        return `${airportCity} (${airportCode})`;
    }
    static async getAirportName(code) {
        const condition = `airport_code='${code}'`;
        const data = await FlightModel.selectData("flight_airport_list", condition);
        if (!data || !data.result || data.result.length === 0) return code;
        const airportName = data.result[0].airport_name;
        return `${airportName}`;
    }
    static async getAirLineName(code) {
        const condition = `code='${code}'`;
        const data = await FlightModel.selectData("airline_list", condition);
        if (!data || !data.result || data.result.length === 0) return code;
        const airLineName = data.result[0].name;
        return `${airLineName}`;
    }
    static async getAdditionalData(app_reference) {
        const condition = `app_reference='${app_reference}'`;
        const data = await FlightModel.selectData("flight_booking_online_additional_details", condition);
        if (!data || !data.result || data.result.length === 0) return null;
        return data.result[0];
    }
    static getOnlyPrice(keys, APIAttr = {}) {
        for (const k of keys) {
            if (APIAttr?.$?.[k] != null && APIAttr?.$?.[k] != undefined && APIAttr?.$?.[k] != 'undefined') {
                if (APIAttr?.$?.[k] != undefined) {
                    const value = String(APIAttr?.$?.[k]).replace(/[^0-9.]/g, '');
                    return parseFloat(value) || 0;
                } else {
                    return 0;
                }
            }
        }
    }
    static async insertReservationData(respData, app_reference, postData, commission,reservatioRequestXml) {
        try {
            
           // console.log('postData',postData.passenger_detail);return false;
            const user_id = postData.user_id;
            const toArray = val => Array.isArray(val) ? val : [val];

            const segments = toArray(respData?.['air:AirItinerary']?.['air:AirSegment']);
            const segKeys = Object.keys(segments);

            const airPricingSolution = respData?.['air:AirPriceResult']?.['air:AirPricingSolution'];

            const priceKey = airPricingSolution?.$?.Key || null;
            const booking_id = this.generateFlightPriceId(priceKey);

            const firstSegment = segments[segKeys[0]]?.$ || {};
            const lastSegment = segments[segKeys[segKeys.length - 1]]?.$ || {};

            const Carrier = firstSegment.Carrier || null;
            const FlightNumber = firstSegment.FlightNumber || null;
            const ClassOfService = firstSegment.ClassOfService || null;
            const cabinClass = firstSegment.CabinClass || null;
            const ProviderCode = firstSegment.ProviderCode || null;

            // Journey Info
            const journeyStart = firstSegment.DepartureTime || null;
            const journeyEnd = lastSegment.ArrivalTime || null;
            const journeyFrom = firstSegment.Origin || null;
            const journeyTo = lastSegment.Destination || null;

            const contactDetail = postData.contact_detail;

            const totalFare = airPricingSolution?.$?.TotalPrice || null;
            const baseFare = airPricingSolution?.$?.BasePrice || null;
            const taxes = airPricingSolution?.$?.Taxes || null;

            const OptionalServices = airPricingSolution["air:OptionalServices"];
            const OptionalService = OptionalServices ? toArray(OptionalServices["air:OptionalService"]) : [];
            
            const AirPricingInfo = airPricingSolution["air:AirPricingInfo"];

            let BookingInfo = airPricingSolution["air:AirPricingInfo"]["air:BookingInfo"];

            if (BookingInfo && !Array.isArray(BookingInfo)) {
                BookingInfo = [BookingInfo];
            }

            const CabinClassArr = BookingInfo ? BookingInfo.map(fi => fi?.$?.CabinClass || null) : [];
            const CabinClass = CabinClassArr.length > 0 ? CabinClassArr : null;
            let fareInfoArr = toArray(airPricingSolution["air:AirPricingInfo"])[0]?.["air:FareInfo"];
            if (fareInfoArr && !Array.isArray(fareInfoArr)) {
                fareInfoArr = [fareInfoArr];
            }
            const fareFamilies = fareInfoArr? fareInfoArr.map(fi => fi?.$?.FareFamily || null) : [];
            const fareFamily =  fareFamilies.length > 0 ? fareFamilies[0] : null;
            const calculatedFare = {FUELCHARGE: 0, INC: 0, RCF: 0, MGMNTFEE: 0, GSTonMGMNTFEE: 0, TTF: 0, Services: 0, tdsPVal: 0};


            // =========================================================
            // 1. BOOKING DETAILS INSERT
            // =========================================================
            let bookingdetails;
            try {
                bookingdetails = {
                    status: "newtp",
                    booking_status: "BOOKING_PENDING",
                    booking_id: booking_id || null,
                    app_reference: app_reference || "",
                    trip_type: "oneway",
                    fare_type: fareFamily || null,

                    phone: contactDetail.mobile || "",
                    country_code: contactDetail.country_code || "",
                    email: contactDetail.email || "",

                    currency: "INR",
                    currency_conversion_rate: 1,
                    data: null,
                    booking_source: "Travelport",
                    created_datetime: new Date(),

                    service_tax: 0,
                    igst: 0,
                    agent_markup: commission.AgentMarkup || 0,
                    admin_markup: commission.AdminMarkup || 0,
                    dist_markup: commission.DistMarkup || 0,
                    airline_markup: 0,

                    total_fare: parseFloat(
                        totalFare.replace("INR", "")
                    ),

                    journey_start: journeyStart,
                    journey_end: journeyEnd,

                    journey_from: journeyFrom
                        ? await this.getAirportCity(journeyFrom)
                        : null,

                    journey_to: journeyTo
                        ? await this.getAirportCity(journeyTo)
                        : null,

                    dist_segment_incentive: 0,
                    dist_tds_on_segment_incentive: 0,

                    admin_commission: 0,
                    admin_tds_on_commission: 0,

                    discount: commission.TTF,
                    agent_commission: commission.INC,
                    agent_tds_on_commission: commission.tds_p_val,

                    api_total_fare: commission.ShowingFare,

                    basic_fare: parseFloat(
                        baseFare.replace("INR", "")
                    ),

                    api_total_tax: parseFloat(
                        taxes.replace("INR", "")
                    ),

                    fuel_charge:
                        commission.FUELCHARGE ||
                        TravelportAdapter.fuel_charge,

                    api_total_display_fare: commission.ShowingFare,
                    app_user_buying_price: commission.NetFare,
                    meal_and_baggage_fare: 0,
                    created_by_id: user_id,
                };
                
                const bookingResult = await FlightModel.insertData(
                    "flight_booking_details",
                    bookingdetails
                );
                
            } catch (error) {
                console.error( "❌ BOOKING DETAILS INSERT ERROR");
                console.error("Error Message:", error.message);
                console.error("Full Error:", error);
                console.error("Stack:", error.stack);
                throw error;
            }


            // =========================================================
            // 2. PASSENGER DETAILS INSERT
            // =========================================================
            const resRequest = await xml2js.parseStringPromise(reservatioRequestXml, { explicitArray: false }).catch(() => null);
            const BookingTraveler = toArray(resRequest?.['soapenv:Envelope']?.['soapenv:Body']?.['AirCreateReservationReq']?.['BookingTraveler']) || {};
            
            const travelerKeyMap = {};

            BookingTraveler.forEach(traveler => {
                const name = traveler?.BookingTravelerName?.$ || {};

                const prefix = name.Prefix || "";
                const first = name.First || "";
                const last = name.Last || "";

                const travelerNameKey =
                    `${prefix}_${first}_${last}`.toLowerCase();

                travelerKeyMap[travelerNameKey] = {
                    travelerRef: traveler?.$?.Key || null,
                    passengerId: null
                };
            });


            const passengerData = postData.passenger_detail;

            for (const paxType in passengerData) {

                if (!Object.prototype.hasOwnProperty.call(
                    passengerData,
                    paxType
                )) {
                    continue;
                }

                const paxList = passengerData[paxType];

                for (let paxIndex = 0; paxIndex < paxList.length; paxIndex++) {

                    const pax = paxList[paxIndex];

                    let insertPax;

                    try {

                        insertPax = {
                            app_reference: app_reference,
                            booking_status: "BOOKING_PENDING",
                            passenger_type:
                                this.formatPassengerType(paxType) || "",
                            title: pax.prefix || "",
                            first_name: pax.first_name || "",
                            last_name: pax.last_name || "",
                            date_of_birth: pax.dob || null,
                            passenger_nationality:
                                pax.nationality || "indian",
                            gender:
                                this.formatGender(pax.gender) || "",
                            status: "BOOKING_PENDING",
                        };

                        const passengerResult =
                            await FlightModel.insertData(
                                "flight_booking_passenger_details",
                                insertPax
                            );


                        // ==========================================
                        // Passenger name se traveler ko match karo
                        // ==========================================

                        const passengerNameKey =
                            `${pax.prefix}_${pax.first_name}_${pax.last_name}`
                                .toLowerCase();

                        if (travelerKeyMap[passengerNameKey]) {

                            // DB se mili passenger ID
                            travelerKeyMap[passengerNameKey].passengerId =
                                passengerResult.insertId;

                            console.log(
                                "Passenger Mapping:",
                                passengerNameKey,
                                "=> TravelerRef:",
                                travelerKeyMap[passengerNameKey].travelerRef,
                                "=> DB ID:",
                                passengerResult.insertId
                            );
                        }

                    } catch (error) {

                        console.error(
                            `❌ PASSENGER INSERT ERROR [${paxType}][${paxIndex}]`
                        );

                        console.error("Error Message:", error.message);
                        console.error("Full Error:", error);
                        console.error("Stack:", error.stack);

                        throw error;
                    }
                }
            }
            // =========================================================
            // 3. ORIGINAL FARE
            // =========================================================

            const originalFare = {
                TotalPrice: parseFloat(
                    totalFare.replace("INR", "")
                ),

                BasePrice: parseFloat(
                    baseFare.replace("INR", "")
                ),

                Taxes: parseFloat(
                    taxes.replace("INR", "")
                ),

                Fees:
                    parseFloat(
                        AirPricingInfo?.$?.Fees?.replace("INR", "")
                    ) || 0
            };


            // =========================================================
            // 4. TRANSACTION DETAILS INSERT
            // =========================================================

            let transactionDetailsData;
            let TrnsID;

            try {

                transactionDetailsData = {
                    app_reference: app_reference,
                    source: "Travelport",
                    airline: Carrier || "",
                    pnr: "",
                    status: "BOOKING_PENDING",

                    total_fare: originalFare.TotalPrice,
                    api_total_fare: originalFare.TotalPrice,

                    basic_fare:
                        originalFare.BasePrice +
                        originalFare.Fees,

                    fuel_charge:
                        calculatedFare.FUELCHARGE,

                    api_total_tax:
                        originalFare.Taxes,

                    api_total_display_fare:
                        originalFare.TotalPrice,

                    app_user_buying_price: 0,

                    agent_commission:
                        calculatedFare.INC,

                    agent_plb:
                        calculatedFare.INC,

                    agent_segment_incentive:
                        calculatedFare.RCF,

                    agent_tds_on_commission:
                        calculatedFare.tdsPVal,

                    admin_markup: 0,
                    dist_markup: 0,
                    agent_markup: 0,

                    service_tax:
                        calculatedFare.MGMNTFEE,

                    igst:
                        calculatedFare.GSTonMGMNTFEE,

                    discount_code: "ttf",
                    discount: calculatedFare.TTF,

                    payment_status: "unpaid",
                    refund_type: "api_refundable",

                    meal_and_baggage_fare:
                        calculatedFare?.Services || 0
                };

                TrnsID = await FlightModel.insertData(
                    "flight_booking_transaction_details",
                    transactionDetailsData
                );
            } catch (error) {
                console.error("❌ TRANSACTION DETAILS INSERT ERROR");
                console.error("Error Message:",error.message);
                console.error("Full Error:",error);
                console.error("Stack:", error.stack);
                throw error;
            }
            // =========================================================
            // 5. ITINERARY DETAILS INSERT
            // =========================================================
            let InsertedItinary = {};
            for (let i = 0; i < segKeys.length; i++) {
                const key = segKeys[i];
                const seg = segments[key] || {};
                const attr = seg?.$ || {};
                const itinaryKey = attr?.Key || '';

                const cabinClass = CabinClassArr[i] || null;
                let insertItineraryObj;
                try {

                    insertItineraryObj = {
                        status: "PENDING",
                        app_reference: app_reference || null,
                        flight_booking_transaction_details_fk: TrnsID?.insertId || null,
                        airline_pnr: "",
                        airline_code: attr.Carrier || null,
                        flight_number: attr.FlightNumber || null,
                        booking_source: "Travelport",
                        airline_name: attr.Carrier ? await this.getAirLineName(attr.Carrier) : null,
                        fare_class: fareFamily || null,
                        from_airport_code: attr.Origin || null,
                        from_airport_name: attr.Origin ? await this.getAirportName(attr.Origin): null,
                        to_airport_code: attr.Destination || null,
                        to_airport_name: attr.Destination ? await this.getAirportName(attr.Destination) : null,
                        departure_datetime: attr.DepartureTime || null,
                        arrival_datetime: attr.ArrivalTime || null,
                        origin_terminal: 1,
                        destination_terminal: 1,
                        cabin_class: cabinClass + "-" + ClassOfService,
                        operating_carrier: attr.Carrier || null
                    };
                    const rr = await FlightModel.insertData("flight_booking_itinerary_details",insertItineraryObj);
                    InsertedItinary[itinaryKey] = rr.insertId;
                } catch (error) {
                    console.error(`❌ ITINERARY INSERT ERROR [${i}]`);
                    console.error("Error Message:",error.message);
                    console.error("Full Error:", error);
                    console.error("Stack:",error.stack);
                    throw error;
                }  
            }
            
            // =========================================================
            const optionalServiceArr = toArray(
                OptionalServices?.["air:OptionalService"]
            );
            const pricedServices = optionalServiceArr.filter(service =>
                service?.$?.ServiceStatus?.toLowerCase() === "priced"
            );

            if (pricedServices.length > 0) {
                for (const service of pricedServices) {
                    const attr = service?.$ || {};
                    const serviceData = service?.["common_v52_0:ServiceData"]?.$ || {};
                    const airSegmentRef = serviceData?.AirSegmentRef || null;
                    const i_origin = airSegmentRef ? (InsertedItinary[airSegmentRef] || null) : null;
                    
                    const bookingTravelerRef = serviceData?.BookingTravelerRef;
                    const passengerEntry = Object.values(travelerKeyMap).find(
                        item => item.travelerRef === bookingTravelerRef
                    );
                    const p_origin = passengerEntry?.passengerId || null;

                    const fare = parseFloat( (attr.TotalPrice || "0").replace(/[^\d.]/g, "") ) || 0;
                    const value = attr.ProviderDefinedType || serviceData?.Data || null;
                    const description = service?.["common_v52_0:ServiceInfo"]?.[  "common_v52_0:Description" ] || attr.DisplayText ||
                        null;
  
                    // =========================
                    // SEAT
                    // =========================
                    if (attr.Type === "PreReservedSeatAssignment") {
                        const seatId = await FlightModel.insertData(
                            "flight_booking_seat_details",
                            {
                                p_origin: p_origin,
                                i_origin: i_origin,
                                seat: serviceData?.Data || null,
                                fare: fare,
                                is_selected: 1 
                            }
                        );
                    }
                    // =========================
                    // MEAL
                    // =========================
                    else if (attr.Type === "MealOrBeverage") {

                        const mealId =  await FlightModel.insertData(
                            "flight_booking_meals_details",
                            {
                                p_origin: p_origin,
                                i_origin: i_origin,
                                value: value,
                                description: description,
                                fare: fare,
                                is_selected: 1
                            }
                        );
                    }
                    // =========================
                    // BAGGAGE
                    // =========================
                    else if (attr.Type === "Baggage" || attr.Type === "BaggageAllowance" ) {
                        const baggageId = await FlightModel.insertData(
                            "flight_booking_baggage_details",
                            {
                                p_origin: p_origin,
                                i_origin: i_origin,
                                is_selected: 1,
                                value: value,
                                description: description,
                                fare: fare
                            }
                        );
                    }
                }
            }
            // =========================================================
        } catch (error) {
            console.error("Error Message:",error.message );
            console.error("Full Error:",error);
            console.error("Stack:",error.stack);
            throw error;
        }
    }
    
    async getCommisionCalF(providerCode, baseFare, grossFare, fee = 0, fareFamily = "regular", services = 0, paxCount = 1, groupType = "LCC", user_id = null, fromAprReq = false, isSNF = false, AdminDistMarkupAll = [], PLBDATA_All = [], AGENT_MARKUP = [], isReturn = false) {
        let managementFee = 0;
        let managementFeeTax = 0;
        let totalmanagementFees = 0;
        if (TravelportAdapter.manageMentFeeApplicable) {
            managementFee = TravelportAdapter.manageMentFee;
            managementFeeTax = TravelportAdapter.manageMentFeeTax;
            totalmanagementFees = managementFee + managementFeeTax;
        }
        const FIXED_USER_ID = user_id;
        const FUELCHARGE = TravelportAdapter.fuel_charge;

        grossFare = services > 0 ? (grossFare - services) : grossFare;

        const is1G = providerCode === "1G";

        const { admin, dist } = await this.extractUserMarkup(AdminDistMarkupAll, user_id);
        let PLBDATA = {};
        if (groupType !== 'LCC') {
            if (!PLBDATA_All?.[groupType]) {
                PLBDATA = PLBDATA_All?.['GDS'] || {}
            } else {
                PLBDATA = PLBDATA_All?.[groupType] || {};
            }
        } else {
            PLBDATA = PLBDATA_All?.[groupType] || {};
        }
        if (fareFamily != null) {
            fareFamily = fareFamily.replace("Fare", "").trim().toLowerCase().replace(/\s+/g, "_");
        }

        let OnePLBDATA = {}; 
        let isNoGdsPlbApplied = true;

        if (PLBDATA && Object.keys(PLBDATA).length) {
            isNoGdsPlbApplied = false;
        }
        if (PLBDATA?.[fareFamily]) {
            OnePLBDATA = PLBDATA[fareFamily];
        }
        // ADMIN + DIST MARKUP
        let UpdateFare = 0;
        let dist_markup = 0;
        let admin_markup = 0;
        
        if (dist) {
            dist_markup = dist.type === "plus" ? Number(dist.value) : (baseFare * Number(dist.value)) / 100;
            UpdateFare += dist_markup;
        }
        if (admin) {
            admin_markup = admin.type === "plus" ? Number(admin.value) : (baseFare * Number(admin.value)) / 100;
            UpdateFare += admin_markup;//admin.subtype == "2" ? -amt : amt;
        }
        // DEFAULT PLB VALUES
        let DiOnBaseFare = 0;
        let DiOnGrossFare = 0;
        let MonthPLB = 0;
        let QuaterPLB = 0;
        let YearlyPLB = 0;
        let ItntlPLB = 0;
        if (Object.keys(OnePLBDATA).length) {
            DiOnBaseFare = OnePLBDATA.TTF ?? DiOnBaseFare;
            DiOnGrossFare = OnePLBDATA.DI ?? DiOnGrossFare;
            MonthPLB = OnePLBDATA.MPLB ?? MonthPLB;
            QuaterPLB = OnePLBDATA.QPLB ?? QuaterPLB;
            YearlyPLB = OnePLBDATA.YPLB ?? YearlyPLB;
            ItntlPLB = OnePLBDATA.IPLB ?? ItntlPLB;
        }
        if (is1G && (isNoGdsPlbApplied || !Object.keys(OnePLBDATA).length)) {
            DiOnBaseFare = 0;
            DiOnGrossFare = 0;
            MonthPLB = 0;
            QuaterPLB = 0;
            YearlyPLB = 0;
            ItntlPLB = 0;
        }
        // COMMISSION CALCULATION
        const TTF = (baseFare * DiOnBaseFare) / 100;
        const RCF = +(((grossFare - fee) * DiOnGrossFare) / 100).toFixed(2);

        const ASF = +((baseFare * MonthPLB) / 100).toFixed(2);
        const PHF = +((baseFare * QuaterPLB) / 100).toFixed(2);
        const UDF = +((baseFare * ItntlPLB) / 100).toFixed(2);
        const GST = +((baseFare * DiOnBaseFare) / 100).toFixed(2);

        // INCENTIVE
        let INC =
            (baseFare + FUELCHARGE) *
            (MonthPLB + QuaterPLB + YearlyPLB) / 100;

        let OriginalInc = +INC.toFixed(2);
        let tdsPVal = 0;
        if (TravelportAdapter.tdsApplicable) {
            tdsPVal = (OriginalInc * TravelportAdapter.tdsPVal) / 100;
            OriginalInc = OriginalInc - tdsPVal;
        }
        // FINAL FARE 
        let ShowingFare = 0;
        let NetFare = 0;
        const agentMarkUp = (isReturn) ? (AGENT_MARKUP?.value * 2) : AGENT_MARKUP?.value;
        const agentMarkupValue = Number(agentMarkUp) || 0;
        ShowingFare = grossFare - TTF - RCF;
        NetFare = ShowingFare - INC;
        ShowingFare += UpdateFare;
        NetFare += UpdateFare;

        ShowingFare += agentMarkupValue;

        ShowingFare = ShowingFare + totalmanagementFees;
        NetFare = NetFare + totalmanagementFees;

        const BFC = (TTF * 5) / 100;

        if (fromAprReq == true) {
            let aprFare = {
                UpdateFare: +UpdateFare.toFixed(2),
                ShowingFare: +ShowingFare.toFixed(2),
                NetFare: +NetFare.toFixed(2),
                TaxNmrkp: +(ShowingFare - (baseFare + fee)).toFixed(2),
            }
            //if (isSNF) {
            aprFare.inc = +INC.toFixed(2);
            //}
            return aprFare;
        }
        return {
            FareFamily: fareFamily,
            tds_p_val: tdsPVal,
            BaseFare: +baseFare.toFixed(2),
            GrossFare: +grossFare.toFixed(2),
            TTF: +TTF.toFixed(2),
            RCF,
            ASF,
            PHF,
            UDF,
            GST,
            BFC: +BFC.toFixed(2),
            INC: +INC.toFixed(2),
            OriginalInc,
            FUELCHARGE,
            UpdateFare: +UpdateFare.toFixed(2),
            ShowingFare: +ShowingFare.toFixed(2),
            NetFare: +NetFare.toFixed(2),
            TaxNmrkp: +(ShowingFare - (baseFare + fee)).toFixed(2),
            ADMIN: admin || {},
            DIST: dist || {},
            AdminMarkup : admin_markup,
            DistMarkup : dist_markup,
            AgentMarkup : agentMarkupValue,
        };
    }

    async getCalculateFare({
        providerCode,
        baseFare,
        grossFare,
        fee = 0,
        services = 0,
        fareFamily = "regular",
        paxCount = 1,
        groupType = "LCC"
    }) {

        const FIXED_USER_ID = 4649;
        const FUELCHARGE = 50;

        // ---------------------------
        // STEP 1: SERVICES ADJUST
        // ---------------------------
        grossFare = services > 0 ? grossFare - services : grossFare;

        const is1G = providerCode === "1G";

        // ---------------------------
        // CACHE
        // ---------------------------
        const AdminDistMarkupAll = await getCacheData("GET_ADMIN_DIST_MARKUP");
        const PLBDATA_All = await getCacheData("GET_PLBDATA_All");

        const { admin, dist } = await this.extractUserMarkup(
            AdminDistMarkupAll,
            FIXED_USER_ID
        );

        const PLBDATA = PLBDATA_All?.[FIXED_USER_ID] || {};

        // ---------------------------
        // FARE FAMILY NORMALIZE
        // ---------------------------
        fareFamily = fareFamily
            .replace("Fare", "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_");

        // ---------------------------
        // GROUP TYPE LOGIC (PHP MATCH)
        // ---------------------------
        let OnePLBDATA = {};
        let isNoGdsPlbApplied = true;

        if (PLBDATA && Object.keys(PLBDATA).length) {
            isNoGdsPlbApplied = false;
        }

        const grp = groupType.toLowerCase() === "6e" || groupType.toLowerCase() === "lcc"
            ? "LCC"
            : groupType.toUpperCase();

        if (PLBDATA[grp]?.[fareFamily]) {
            OnePLBDATA = PLBDATA[grp][fareFamily];
        } else if (PLBDATA["GDS"]?.[fareFamily]) {
            OnePLBDATA = PLBDATA["GDS"][fareFamily];
        }

        // ---------------------------
        // ADMIN + DIST MARKUP
        // ---------------------------
        let UpdateFare = 0;

        if (dist) {
            UpdateFare += dist.type === "plus"
                ? Number(dist.value)
                : (baseFare * Number(dist.value)) / 100;
        }

        if (admin) {
            let amt = admin.type === "plus"
                ? Number(admin.value)
                : (baseFare * Number(admin.value)) / 100;

            UpdateFare = amt;//admin.subtype == "2" ? -amt : amt;
        }
        //UpdateFare *= paxCount;

        // ---------------------------
        // DEFAULT PLB VALUES
        // ---------------------------
        let DiOnBaseFare = 3.5;
        let DiOnGrossFare = 0.25;
        let MonthPLB = 0.75;
        let QuaterPLB = 0.25;
        let YearlyPLB = 0.25;
        let ItntlPLB = 0.75;


        if (OnePLBDATA && Object.keys(OnePLBDATA).length) {
            DiOnBaseFare = OnePLBDATA.TTF ?? DiOnBaseFare;
            DiOnGrossFare = OnePLBDATA.DI ?? DiOnGrossFare;
            MonthPLB = OnePLBDATA.MPLB ?? MonthPLB;
            QuaterPLB = OnePLBDATA.QPLB ?? QuaterPLB;
            YearlyPLB = OnePLBDATA.YPLB ?? YearlyPLB;
            ItntlPLB = OnePLBDATA.IPLB ?? ItntlPLB;
        }

        // ---------------------------
        // 1G PLB RESET (LIVE PHP)
        // ---------------------------
        if (is1G && (isNoGdsPlbApplied || !Object.keys(OnePLBDATA).length)) {
            DiOnBaseFare = 0;
            DiOnGrossFare = 0;
            MonthPLB = 0;
            QuaterPLB = 0;
            YearlyPLB = 0;
            ItntlPLB = 0;
        }

        // ---------------------------
        // COMMISSION
        // ---------------------------
        const TTF = (baseFare * DiOnBaseFare) / 100;
        const RCF = (((grossFare - fee) * DiOnGrossFare) / 100);

        const ASF = ((baseFare * MonthPLB) / 100);
        const PHF = ((baseFare * QuaterPLB) / 100);
        const UDF = ((baseFare * ItntlPLB) / 100);
        const GST = ((baseFare * DiOnBaseFare) / 100);

        // ---------------------------
        // MGMNT FEE
        // ---------------------------
        const MGMNTFEE = 0;
        const GSTonMGMNTFEE = 0;

        // ---------------------------
        // INCENTIVE
        // ---------------------------
        let INC = (baseFare + FUELCHARGE) *
            (MonthPLB + QuaterPLB + YearlyPLB) / 100;

        const OriginalInc = +INC.toFixed(2);

        // ---------------------------
        // FINAL FARE
        // ---------------------------
        let ShowingFare =
            grossFare - TTF + MGMNTFEE + GSTonMGMNTFEE - RCF;

        let NetFare = ShowingFare - INC;

        ShowingFare += UpdateFare;
        NetFare += UpdateFare;

        const BFC = (TTF * 5) / 100;

        return {
            providerCode,
            grp,
            FareFamily: fareFamily,
            TTF: +TTF.toFixed(2),
            RCF,
            ASF,
            PHF,
            UDF,
            GST,
            BFC: +BFC.toFixed(2),
            INC: +INC.toFixed(2),
            OriginalInc,
            FUELCHARGE,
            UpdateFare: +UpdateFare.toFixed(2),
            ShowingFare: +ShowingFare.toFixed(2),
            NetFare: +NetFare.toFixed(2),
            TaxNmrkp: +(ShowingFare - (baseFare + fee)).toFixed(2),
            ADMIN: admin || {},
            DIST: dist || {},
        };
    }


    async extractUserMarkup(markupAll, userId) {
        let admin = null;
        let dist = null;

        if (!markupAll) return { admin, dist };

        // CASE 1: Object with admin/dist keys (tumhara case)
        if (markupAll.admin || markupAll.dist) {

            if (markupAll.admin && Number(markupAll.admin.created_for) === Number(userId)) {
                admin = markupAll.admin;
            }

            // dist agar kisi aur user ka hai to bhi allow karo
            // kyunki distributor markup parent user pe apply hota hai
            if (markupAll.dist) {
                dist = markupAll.dist;
            }
        }

        // CASE 2: Array (future-safe)
        else if (Array.isArray(markupAll)) {
            for (const row of markupAll) {
                if (Number(row.created_for) !== Number(userId)) continue;

                if (row.creation_source === "admin") admin = row;
                if (row.creation_source === "dist") dist = row;
            }
        }

        return { admin, dist };
    }

    ////********************************************************************** */
    async cancelFlightBookingOLD(connection, postData) {
        const app_ref = postData.app_reference;
        try {
            if (!app_ref) {
                throw {
                    statusCode: 400,
                    message: "app_reference is required",
                    errors: ["app_reference is required in request body"]
                };
            }
            const bookingDetails = await FlightModel.getBookingByAppReference(connection, app_ref);
            if (!bookingDetails.status || !bookingDetails.data) {
                throw {
                    statusCode: 404,
                    message: "Flight booking not found",
                    errors: ["Booking with this app_reference does not exist"]
                };
            }
            const booking = bookingDetails.data;
            const cancellationDetails = {
                app_reference: app_ref,
                booking_id: booking.booking_id || null,
                amendment_id: postData.amendmentId || null,
                remarks: postData.remarks || null,
                type: postData.type || null,
                passengers: booking.pax_names,
            };
            const insertCancellationData = await FlightModel.createCancellation(cancellationDetails);
            if (!insertCancellationData.status) {
                throw {
                    statusCode: 500,
                    message: "Failed to save cancellation details to database",
                    errors: ["Database insertion failed"]
                };
            }
            const lastInsertedId = insertCancellationData.insert_id;
            // Step 7: Get cancellation charges from database
            const cancellationFees = await FlightModel.getFareRules('cancellation_charges');

            let cancellationFee = 0;
            if (cancellationFees.status && cancellationFees.data && cancellationFees.data.length > 0) {
                cancellationFee = cancellationFees.data[0].fare_rule;
            }
            // Step 8: Calculate total fare and refundable amount
            // const fareDetails = this.calculateFareDetailsForCancellation(amendmentDetails);
            // const updateData = {
            //     status: amendmentDetails.amendmentStatus,
            //     admin_cancellation_fees: cancellationFee,
            //     refundable_amount: fareDetails.refundableFare || 0,
            //     fare_amount: fareDetails.totalFare,
            //     response: JSON.stringify(amendmentDetails),
            // };
            // await FlightModel.updateCancellation(lastInsertedId, updateData);

            // Step 10: Return success response
            return {
                status: 1,
                statusCode: 200,
                message: 'Your ticket has been cancelled successfully.',
                amendment_id: postData.amendmentId || null,
                data: {
                    cancellation_id: lastInsertedId,
                    amendment_id: postData.amendmentId || null,
                    refundable_amount: 0,
                    cancellation_charges: cancellationFee,
                    status: 'success'
                }
            };

        } catch (error) {
            console.error('Error in cancelFlightBooking:', error);
            return {
                status: 0,
                statusCode: error.statusCode || 500,
                message: error.message || 'Something went wrong during flight cancellation',
                errors: error.errors || [error.message]
            };
        }
    }

    async cancelFlightBooking(connection, postData) {

        const entity_user_id = postData.user_id;
        const adminCancelationCharge = 180;
        const cancelData = postData.data;
        const itPaxData = postData.users;
        const amendment_type = postData.type;
        const remarks = postData.remarks;

        const itidata = cancelData.map(item => item.origin);
        const paxData = itPaxData.map(item => item.origin);

        const app_reference = postData.app_reference;
        let status = 0;
        let message = "Something went wrong.Please try again later.";
        let cacleStatu = '';
        let returnData = [];
        const amendment_id = TravelportAdapter.generateAppTransactionReference("FC");

        try {
            
            const condition = `app_reference='${app_reference}'`;
            const getBooking = await FlightModel.selectData('flight_booking_details',condition,'*');
            if (!getBooking || !getBooking.result || getBooking.result.length === 0){
                throw {
                    status: 0,
                    message: 'Booking Detail Not Found!.Api Error.',
                    error: 'Booking Detail Not Found!.Api Error.'
                };
            }
            const bookingDetails = getBooking.result[0];
            const getAdditional = await FlightModel.selectData('flight_booking_online_additional_details',condition,'*');
           
            if (getAdditional.result || getAdditional.result.length > 0){
                const additionalData = getAdditional?.result[0];
                const providerCode   = additionalData.pro_code;

                const getItinerary = await FlightModel.selectData('flight_booking_itinerary_details',condition,'*');
                const getPax = await FlightModel.selectData('flight_booking_passenger_details',condition,'*');
                if ((getItinerary.result || getItinerary.result.length > 0) && (getPax.result || getPax.result.length > 0)){
                    const allItinary = getItinerary?.result || [];
                    const allPaxData = getPax?.result || [];
                    let cntItinary = 0;
                    const itinaryCheckArry = [];
                    const segmentOrDesArr = [];
                    const paxDataArrOrigin = {};

                    allPaxData.forEach(v => {
                        paxDataArrOrigin[v.origin] = v;
                    });
                    allItinary.forEach(itn => {
                        if (itidata.includes(itn.origin)) {
                            cntItinary++;
                        }
                        const exists = itinaryCheckArry.some(
                            item => item.segment_indicator === itn.segment_indicator
                        );
                        if (!exists && itidata.includes(itn.origin)) {
                            itinaryCheckArry.push(itn);
                            const or_dest_Str = `${itn.from_airport_code}-${itn.to_airport_code}`;
                            segmentOrDesArr.push(or_dest_Str);
                        }
                    });

                    let cehckCancelationType = "";
                    if (allPaxData.length > paxData.length || allItinary.length > itidata.length) {
                        cehckCancelationType = "partial";
                    } else {
                        cehckCancelationType = "full";
                    }
                    const allowedAmendments = ["CANCLE_BY_AIR_LINE","ADD_INFANT","CORRECTION","NO_SHOW","SSR","REISSUE","REISSUE_QUOTATION","VOIDED"];

                    if (providerCode.toLowerCase() === "ach") {
                        if(cehckCancelationType == 'partial' || cehckCancelationType == 'full'){
                            let cancelationCharges =
                                paxData.length * itinaryCheckArry.length * adminCancelationCharge;
                            if ((amendment_type || "").toUpperCase() === "CANCLE_BY_AIR_LINE") {
                                cancelationCharges = 0;
                            }
        
                            const cancellationMapArr = [];
                            const cancellationDataArr = [];
                            let totalAmountFinal = 0;
                            let totalAgentCommission = 0;
                            let totalAgentCommissionTds = 0;
                            let totalAdminMarkup = 0;
                            let totalDistMarkup = 0;
                            // Create cancellation map data
                            for (const itv of itidata) {
                                for (const pv of paxData) {
                                    cancellationMapArr.push({
                                        app_reference,
                                        i_origin: itv,
                                        p_origin: pv,
                                        created_by: entity_user_id,
                                        updated_by: entity_user_id,
                                        created_datetime: new Date(),
                                        updated_datetime: new Date()
                                    });
                                }
                            }

                            // Calculate fare totals
                            for (const pv of paxData) {
                                const pax = paxDataArrOrigin[pv];
                                if (!pax) continue;
                                totalAmountFinal += Number(pax.net_fare || 0);
                                totalAgentCommission += Number(pax.agent_commission || 0);
                                totalAgentCommissionTds += Number(pax.agent_tds_on_commission || 0);
                                totalAdminMarkup += Number(pax.admin_markup || 0);
                                totalDistMarkup += Number(pax.dist_markup || 0);
                            }
                            // Passenger Names
                            const paxsName = [];
                            allPaxData.forEach(vs => {
                                if (paxData.includes(vs.origin)) {
                                    paxsName.push({
                                        fn: vs.first_name,
                                        ln: vs.last_name
                                    });
                                }
                            });

                            let doDatabaseOperation = true;
                            // Refund Calculation
                            let refundable_amount =
                                totalAmountFinal -
                                totalAgentCommission +
                                totalAgentCommissionTds +
                                totalAdminMarkup +
                                totalDistMarkup -
                                cancelationCharges;

                            let amendment_charges = 0;
                            let refund_amount_by_admin = 0;
                            let airlineCharge = 0;

                            if (allowedAmendments.includes((amendment_type || "").toUpperCase())) {
                                cehckCancelationType = "partial";
                            }
                            
                            if (cehckCancelationType === "full") {

                                const xmlRefundQuoteRequest = await RefundQuoteRequest(app_reference,paxsName,additionalData,itinaryCheckArry,segmentOrDesArr);
                                const [RefundQuoteRsp] = await Promise.allSettled([
                                    processRequest(xmlRefundQuoteRequest)
                                ]);
                                await FlightModel.flight_xml_log(app_reference, xmlRefundQuoteRequest, RefundQuoteRsp.value, "Travelport Refund Quote Request NODE");
                                const getRefundQuoteArr = await xml2js.parseStringPromise(RefundQuoteRsp.value, { explicitArray: false }).catch(() => null);
                               
                                if(getRefundQuoteArr){
                                    const body = getRefundQuoteArr?.['SOAP:Envelope']?.['SOAP:Body'] || {};
                                    const fault = body?.['SOAP:Fault'];
                                    if (fault) {
                                        // $falutDetails = force_multple_data_format($falutDetails['detail']['common_v52_0:ErrorInfo']);
                                        // $response['status']     = FAILURE_STATUS;
                                        // $response['message']    = $falutDetails[0]['common_v52_0:Description'];
                                        doDatabaseOperation = false;
                                        status = 0;
                                        message = getRefundQuoteArr?.message || "Refund quote failed";
                                    }else{
                                        const AirRefundQuoteRsp = body?.['air:AirRefundQuoteRsp'];
                                        const TCRRefundBundle = AirRefundQuoteRsp?.['air:TCRRefundBundle'];

                                        const refundQuoteData = TCRRefundBundle//getRefundQuoteArr.data;
                                        const refundQuoteAttr = refundQuoteData["air:AirRefundInfo"]?.$ || {};
                                    
                                        const originalRefundAmount = parseFloat(
                                            refundQuoteAttr.RefundAmount.replace(/^INR/, "")
                                        );
                                        const originalRefundFee = parseFloat(
                                            refundQuoteAttr.RefundFee.replace(/^INR/, "")
                                        );
                                        const originalForfeitAmount = parseFloat(
                                            refundQuoteAttr.ForfeitAmount.replace(/^INR/, "")
                                        );
                                        airlineCharge = originalForfeitAmount;
                                        refund_amount_by_admin = Math.floor(
                                            (
                                                originalRefundAmount -
                                                totalAgentCommission +
                                                totalAgentCommissionTds -
                                                cancelationCharges
                                            ) * 100
                                        ) / 100;

                                        refundable_amount = originalRefundAmount;

                                        amendment_charges = Math.floor(
                                            (totalAmountFinal - refund_amount_by_admin) * 100
                                        ) / 100;

                                        cacleStatu = "INITIATED";
                                        status = 2;
                                        message = `Refund Amount is : ${refund_amount_by_admin} to Cancel click OK`;
                                        returnData = refundQuoteData;
                                    }

                                } else {
                                    doDatabaseOperation = false;
                                    status = 0;
                                    message = getRefundQuoteArr?.message || "Refund quote failed";
                                }

                            } else {
                                const newRefundableAmount = (refundable_amount / allItinary.length) * itidata.length;
                                refundable_amount = Number(newRefundableAmount.toFixed(2));
                                status = 1;
                                cacleStatu = "REQUESTED";
                                message = "Your cancellation request is generated.";
                            }

                            if (doDatabaseOperation) {
                                const dbPool = require('../../database/db1');
                                const cancellation_datas = {
                                    app_reference,
                                    booking_id: bookingDetails.booking_id,
                                    amendment_id,
                                    remarks: remarks,
                                    type: amendment_type,
                                    status: cacleStatu,
                                    amendment_charges,
                                    refund_amount_by_admin,
                                    agent_commission_on_booking: totalAgentCommission,
                                    agent_tds_on_commission: totalAgentCommissionTds,
                                    passengers: JSON.stringify(paxsName),
                                    fare_amount: totalAmountFinal,
                                    admin_cancellation_fees: cancelationCharges,
                                    refundable_amount,
                                    response: JSON.stringify(cancellationMapArr),
                                    airline_charges: airlineCharge,
                                    created_at: new Date(),
                                    updated_at: new Date()
                                };
                                const connection = await dbPool.getConnection();
                                try {
                                    await connection.beginTransaction();
                                    const [insertResult] = await connection.query(
                                        "INSERT INTO flight_booking_cancellation_details SET ?",
                                        [cancellation_datas]
                                    );
                                    const fbc_id = insertResult.insertId;
                                    const mapData = cancellationMapArr.map(item => ({
                                        ...item,
                                        fc_origin: fbc_id
                                    }));
                                    await connection.query(
                                        `INSERT INTO flight_booking_cancellation_map
                                        (app_reference, i_origin, p_origin, created_by, updated_by, created_datetime, updated_datetime, fc_origin)
                                        VALUES ?`,
                                        [
                                            mapData.map(item => [
                                                item.app_reference,
                                                item.i_origin,
                                                item.p_origin,
                                                item.created_by,
                                                item.updated_by,
                                                item.created_datetime,
                                                item.updated_datetime,
                                                item.fc_origin
                                            ])
                                        ]
                                    );
                                    await connection.query(
                                        `INSERT INTO queue_event_logs
                                        SET ?`,
                                        [{
                                            app_reference,
                                            event_type: "flight_cancellation",
                                            created_datetime: new Date()
                                        }]
                                    );
                                    await connection.commit();
                                } catch (err) {
                                    await connection.rollback();
                                    status = 0;
                                    message = "Something went wrong.Please try again later.";
                                    throw err;
                                } finally {
                                    connection.release();
                                }
                            }
                        }
                    }else if (providerCode.toLowerCase() === "1g") {
                        const proLocCode = additionalData?.pro_locator_code;
                        const suppCode = additionalData?.supp_code;
                        const airLocCode = additionalData?.air_locator_code;
                        const uniLocCode = additionalData?.uni_locator_code;

                        let cancelationCharges =
                                paxData.length * itinaryCheckArry.length * adminCancelationCharge;
                            if ((amendment_type || "").toUpperCase() === "CANCLE_BY_AIR_LINE") {
                                cancelationCharges = 0;
                            }
        
                            const cancellationMapArr = [];
                            const cancellationDataArr = [];
                            let totalAmountFinal = 0;
                            let totalAgentCommission = 0;
                            let totalAgentCommissionTds = 0;
                            let totalAdminMarkup = 0;
                            let totalDistMarkup = 0;
                            // Create cancellation map data
                            for (const itv of itidata) {
                                for (const pv of paxData) {
                                    cancellationMapArr.push({
                                        app_reference,
                                        i_origin: itv,
                                        p_origin: pv,
                                        created_by: entity_user_id,
                                        updated_by: entity_user_id,
                                        created_datetime: new Date(),
                                        updated_datetime: new Date()
                                    });
                                }
                            }

                            // Calculate fare totals
                            for (const pv of paxData) {
                                const pax = paxDataArrOrigin[pv];
                                if (!pax) continue;
                                totalAmountFinal += Number(pax.net_fare || 0);
                                totalAgentCommission += Number(pax.agent_commission || 0);
                                totalAgentCommissionTds += Number(pax.agent_tds_on_commission || 0);
                                totalAdminMarkup += Number(pax.admin_markup || 0);
                                totalDistMarkup += Number(pax.dist_markup || 0);
                            }
                            // Passenger Names
                            const paxsName = [];
                            allPaxData.forEach(vs => {
                                if (paxData.includes(vs.origin)) {
                                    paxsName.push({
                                        fn: vs.first_name,
                                        ln: vs.last_name
                                    });
                                }
                            });

                            let doDatabaseOperation = true;
                            // Refund Calculation
                            let refundable_amount =
                                totalAmountFinal -
                                totalAgentCommission +
                                totalAgentCommissionTds +
                                totalAdminMarkup +
                                totalDistMarkup -
                                cancelationCharges;

                            let amendment_charges = 0;
                            let refund_amount_by_admin = 0;
                            let airlineCharge = 0;

                            if (allowedAmendments.includes((amendment_type || "").toUpperCase())) {
                                cehckCancelationType = "partial";
                            }
                            if (cehckCancelationType === "full") {
                                const xmlUrRequest = await RetrieveReservationRequest(app_reference, proLocCode,providerCode, suppCode);
                                const [UrRtriveRes] = await Promise.allSettled([
                                    processRequest(xmlUrRequest, '', true)
                                ]);
                                const jsonData = await xml2js.parseStringPromise(UrRtriveRes.value, { explicitArray: false }).catch(() => null);
                                await FlightModel.flight_xml_log(app_reference, xmlUrRequest, UrRtriveRes.value, "Travelport Retrive Reservation NODE");
                                const body = jsonData?.['SOAP:Envelope']?.['SOAP:Body'] || {};
                                const fault = body?.['SOAP:Fault'];
                                if (!fault) {
                                    const getRetrieveRsp =
                                    jsonData?.["SOAP:Envelope"]?.["SOAP:Body"]?.[
                                        "universal:UniversalRecordRetrieveRsp"
                                    ];
                                    if (getRetrieveRsp) {
                                        const getVersion = getRetrieveRsp["universal:UniversalRecord"];
                                        if (getVersion?.$?.Version) {
                                            const version = getVersion.$.Version;
                                            
                                            const cTRequest = await cancelFlightTicketUR(uniLocCode, app_reference, version);
                                            const [CTRtriveRes] = await Promise.allSettled([
                                                processRequest(cTRequest, '', true)
                                            ]);
                                            const CTJsonData = await xml2js.parseStringPromise(CTRtriveRes.value, { explicitArray: false }).catch(() => null);
                                            await FlightModel.flight_xml_log(app_reference, cTRequest, CTRtriveRes.value, "Travelport cancel ticket UR retrive NODE");
                                            const CTbody = CTJsonData?.['SOAP:Envelope']?.['SOAP:Body'] || {};
                                            const CTfault = CTbody?.['SOAP:Fault'];
                                            if(!CTfault){
                                                const cancelResp =
                                                    CTJsonData?.["SOAP:Envelope"]?.["SOAP:Body"]?.[
                                                        "universal:UniversalRecordCancelRsp"
                                                    ];
                                                    const cancelStatus =
                                                        cancelResp["universal:ProviderReservationStatus"]?.$;
                                                    if (cancelStatus && cancelStatus.Cancelled === true) {
                                                        status         = 1;
                                                        cacleStatu     = 'SUCCESS';
                                                        message        = 'Your Booking has been cancelled.';
                                                    }else{
                                                        cacleStatu     = 'PENDING';
                                                        status         = 1;
                                                        message        = 'Your cancellation request send to Admin.';
                                                    } 
                                                
                                            }else{
                                                cacleStatu     = 'PENDING';
                                                status         = 1;
                                                message        = 'Your cancellation request send to Admin.';
                                            }
                                        }
                                    }else{
                                        cacleStatu     = 'PENDING';
                                        status         = 1;
                                        message        = 'Your cancellation request is generated 3.'; 
                                    }
                                }else{
                                    doDatabaseOperation = false;
                                    status              = 0;
                                    message             = 'Cancellation request Error.';
                                }
                            }else{
                                status = 1;
                                cacleStatu = "REQUESTED";
                                message = "Your cancellation request is generated.";
                            }
                            if (doDatabaseOperation) {
                                const dbPool = require('../../database/db1');
                                const cancellation_datas = {
                                    app_reference,
                                    booking_id: bookingDetails.booking_id,
                                    amendment_id,
                                    remarks: remarks,
                                    type: amendment_type,
                                    status: cacleStatu,
                                    amendment_charges,
                                    refund_amount_by_admin,
                                    agent_commission_on_booking: totalAgentCommission,
                                    agent_tds_on_commission: totalAgentCommissionTds,
                                    passengers: JSON.stringify(paxsName),
                                    fare_amount: totalAmountFinal,
                                    admin_cancellation_fees: cancelationCharges,
                                    refundable_amount,
                                    response: JSON.stringify(cancellationMapArr),
                                    airline_charges: airlineCharge,
                                    created_at: new Date(),
                                    updated_at: new Date()
                                };
                                const connection = await dbPool.getConnection();
                                try {
                                    await connection.beginTransaction();
                                    const [insertResult] = await connection.query(
                                        "INSERT INTO flight_booking_cancellation_details SET ?",
                                        [cancellation_datas]
                                    );
                                    const fbc_id = insertResult.insertId;
                                    const mapData = cancellationMapArr.map(item => ({
                                        ...item,
                                        fc_origin: fbc_id
                                    }));
                                    await connection.query(
                                        `INSERT INTO flight_booking_cancellation_map
                                        (app_reference, i_origin, p_origin, created_by, updated_by, created_datetime, updated_datetime, fc_origin)
                                        VALUES ?`,
                                        [
                                            mapData.map(item => [
                                                item.app_reference,
                                                item.i_origin,
                                                item.p_origin,
                                                item.created_by,
                                                item.updated_by,
                                                item.created_datetime,
                                                item.updated_datetime,
                                                item.fc_origin
                                            ])
                                        ]
                                    );
                                    await connection.query(
                                        `INSERT INTO queue_event_logs
                                        SET ?`,
                                        [{
                                            app_reference,
                                            event_type: "flight_cancellation",
                                            created_datetime: new Date()
                                        }]
                                    );

                                    if(cacleStatu == 'SUCCESS'){
                                        const bookingdetails = {booking_status: 'BOOKING_CANCELLED'};
                                        const FBDcondition = `app_reference='${app_reference}'`;
                                        await FlightModel.updateData("flight_booking_details", bookingdetails, FBDcondition);
                                        await FlightModel.updateData("flight_booking_online_additional_details", bookingdetails, FBDcondition);
                                        
                                        const statusDetails = {status: 'BOOKING_CANCELLED'};
                                        await FlightModel.updateData("flight_booking_itinerary_details", statusDetails, FBDcondition);
                                        await FlightModel.updateData("flight_booking_transaction_details", statusDetails, FBDcondition);
 
                                    }

                                    await connection.commit();
                                } catch (err) {
                                    await connection.rollback();
                                    status = 0;
                                    message = "Something went wrong.Please try again later.";
                                    throw err;
                                } finally {
                                    connection.release();
                                }
                            }
                    }

                }
            }
            return {
                status: status,
                message: message,
                amendment_id: amendment_id,
                data: returnData,
                // {
                //     cancellation_id: lastInsertedId,
                //     amendment_id: postData.amendmentId || null,
                //     refundable_amount: 0,
                //     cancellation_charges: cancellationFee,
                //     status: 'success'
                // }
            };
            
        } catch (error) {
            return {
                status: 0,
                message: error.message || 'Something went wrong during flight cancellation',
            };
        }
    }
    async FinalCancelFlightBooking(connection, postData) {
        const entity_user_id = postData.user_id;
        const data = postData.data;
        const app_reference = postData.app_reference;
        let status = 0;
        let message = "Something went wrong.Please try again later.";
        
        try {
            const condition = `app_reference='${app_reference}'`;
            const cancelDetail = await FlightModel.selectData('flight_booking_cancellation_details',condition,'*');
            if (!cancelDetail || !cancelDetail.result || cancelDetail.result.length === 0){
                throw {
                    status: 0,
                    message: 'Booking Detail Not Found!.Api Error.',
                    error: 'Booking Detail Not Found!.Api Error.'
                };
            }
            const cancelData = cancelDetail.result[0];
            const total_refund_amount = cancelData.refund_amount_by_admin;
            const xmlRefundRequest = await flightRefundRequest(app_reference,data);
            const [RefundQuoteRsp] = await Promise.allSettled([
                processRequest(xmlRefundRequest)
            ]);
            await FlightModel.flight_xml_log(app_reference, xmlRefundRequest, RefundQuoteRsp.value, "Travelport Refund Request NODE");
            const fareRefundResponseArr = await xml2js.parseStringPromise(RefundQuoteRsp.value, { explicitArray: false }).catch(() => null);
            
            
            if (this.validFareRefundResponse(fareRefundResponseArr) === true) {
                const refundResponse =
                    fareRefundResponseArr?.["SOAP:Envelope"]?.["SOAP:Body"]?.["air:AirRefundRsp"];
                let refundStatus = "REQUESTED";
                const response = {
                    message: "Your booking is cancel but not refunded",
                    status: 1,
                    data: {}
                };
                const tcrAttributes = refundResponse?.["air:TCR"]?.$ || {};
                if (String(tcrAttributes.Status || "").toLowerCase() === "refunded") {
                    refundStatus = "SUCCESS";
                    response.message = "Booking cancel and amount refunded";
                }
                response.data.TransactionId =
                    refundResponse?.$?.TransactionId || "";
                response.data.refundableAmount = parseFloat(
                    String(tcrAttributes.RefundAmount || "INR0").replace(/^INR/, "")
                );
                response.data.api_refund_status = refundStatus;
                response.data.data = refundResponse;
                return response;
            } else {
                const faultDetails =
                    fareRefundResponseArr
                        ?.["SOAP:Envelope"]
                        ?.["SOAP:Body"]
                        ?.["air:AirRefundRsp"]
                        ?.["air:RefundFailureInfo"];

                const response = {
                    app_referece: app_reference,
                    status: 0,
                    error_type: "Invalid Request",
                    error_type_status: 2,
                    message:
                        "Fare Refund Issue ! Please Contact To your Reprersentative Your reference Id:" +
                        app_reference
                };
                const failureAttributes = faultDetails?.$ || {};
                if (failureAttributes.Message) {
                    response.message = failureAttributes.Message;
                }
                return response;
            }
        } catch (error) {
            return {
                status: 0,
                message: error.message || 'Server Issue Booking Maybe Cancelled. Please Wait for While.',
            };
        }
    }
    validFareRefundResponse(ticketing_response_arr) {
        const faultcode =
            ticketing_response_arr?.["SOAP:Envelope"]?.["SOAP:Body"]?.["SOAP:Fault"]?.faultcode;

        const refundFailureInfo =
            ticketing_response_arr?.["SOAP:Envelope"]?.["SOAP:Body"]?.["air:AirRefundRsp"]?.["air:RefundFailureInfo"];

        if (
            (faultcode !== undefined && faultcode !== null && faultcode !== "") ||
            refundFailureInfo !== undefined
        ) {
            return false;
        }

        return true;
    }

    /**
     * Calculate fare details from amendment response
     * @private
     */
    calculateFareDetailsForCancellation(amendmentDetails) {
        let totalFare = 0;
        const refundableFare = amendmentDetails.refundableAmount || 0;

        if (amendmentDetails.trips && Array.isArray(amendmentDetails.trips)) {
            amendmentDetails.trips.forEach(trip => {
                if (trip.travellers && Array.isArray(trip.travellers)) {
                    trip.travellers.forEach(traveller => {
                        totalFare += traveller.totalFare || 0;
                    });
                }
            });
        }

        return {
            totalFare,
            refundableFare
        };
    }

    static async DownloadFlightTicket(postData,doc, ticket, passengers) {
        const axios = require('axios');
        const QRCode = require('qrcode');

        // These lists are now in the same file
        const trainQuotaList = {
            'GN': 'General Quota',
            'LD': 'Ladies Quota',
            'HO': 'Head quarters/high official Quota',
            'DF': 'Defence Quota',
            'PH': 'Parliament house Quota',
            'FT': 'Foreign Tourist Quota',
            'DP': 'Duty Pass Quota',
            'TQ': 'Tatkal Quota',
            'PT': 'Premium Tatkal Quota',
            'SS': 'Female(above 45 Year)/Senior Citizen/Travelling alone',
            'HP': 'Physically Handicapped Quota',
            'RE': 'Railway Employee Staff on Duty for the train',
            'GNRS': 'General Quota Road Side',
            'OS': 'Out Station',
            'PQ': 'Pooled Quota',
            'RC': 'Reservation Against Cancellation',
            'RS': 'Road Side',
            'YU': 'Yuva',
            'LB': 'Lower Berth'
        };

        const trainCabinClasses = {
            '1A': 'AC First Class',
            '2A': 'AC 2 Tier',
            '3A': 'AC 3 Tier',
            '3E': 'AC 3 Tier Economy',
            'EC': 'Exec. Chair Car',
            'CC': 'AC Chair Car',
            'FC': 'First Class',
            'SL': 'Sleeper Class',
            '2S': 'Second Sitting',
            'EA': 'Anubhuti'
        };

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 15;
        const usableWidth = pageWidth - margin * 2;

        let y = 30;
        let pageCount = 1;

        // Helper function to check and add new page
        const checkAndAddPage = (requiredSpace) => {
            if (y + requiredSpace > pageHeight - 50) {
                doc.addPage();
                y = 30;
                pageCount++;
                drawPageBorder();
                return true;
            }
            return false;
        };

        // Draw page border
        const drawPageBorder = () => {
            doc.rect(margin - 2, 20, pageWidth - (margin * 2) + 4, pageHeight - 45)
                .lineWidth(1)
                .stroke('#cccccc');
        };

        // Helper functions
        const safeText = (val) => val ? String(val) : '';

        const formatDate = (input) => {
            if (!input) return '';
            let d;
            if (typeof input === 'number') {
                d = input < 10000000000 ? new Date(input * 1000) : new Date(input);
            } else {
                d = new Date(input);
            }
            if (isNaN(d.getTime())) return '';

            // Convert to IST
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(d.getTime() + istOffset);

            const day = istDate.getUTCDate().toString().padStart(2, '0');
            const month = istDate.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
            const year = istDate.getUTCFullYear();
            const hours = istDate.getUTCHours().toString().padStart(2, '0');
            const minutes = istDate.getUTCMinutes().toString().padStart(2, '0');
            const seconds = istDate.getUTCSeconds().toString().padStart(2, '0');
            return `${day} ${month} ${year}, ${hours}:${minutes}:${seconds}`;
        };

        // Function to format date for departure/arrival with time first
        const formatDateTime = (input) => {
            if (!input) return '';
            let d;
            if (typeof input === 'number') {
                d = input < 10000000000 ? new Date(input * 1000) : new Date(input);
            } else {
                d = new Date(input);
            }
            if (isNaN(d.getTime())) return '';

            // Convert to IST
            const istOffset = 5.5 * 60 * 60 * 1000;
            const istDate = new Date(d.getTime() + istOffset);

            const hours = istDate.getUTCHours().toString().padStart(2, '0');
            const minutes = istDate.getUTCMinutes().toString().padStart(2, '0');
            const day = istDate.getUTCDate().toString().padStart(2, '0');
            const month = istDate.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
            const year = istDate.getUTCFullYear();

            return `${hours}:${minutes}  ${day}-${month}-${year}`;
        };

        const drawHorizontalLine = (yPos, thickness = 1) => {
            doc.moveTo(margin, yPos)
                .lineTo(pageWidth - margin, yPos)
                .lineWidth(thickness)
                .stroke();
        };

        const loadImage = async (url) => {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            return Buffer.from(response.data, 'binary');
        };

        // Function to generate QR code buffer
        const generateQRBuffer = async (text) => {
            try {
                // Clean text - remove special chars
                const cleanText = String(text).replace(/[^\x20-\x7E|:]/g, '');

                const qrDataURL = await QRCode.toDataURL(cleanText, {
                    errorCorrectionLevel: 'M',
                    width: 150,
                    margin: 1,
                    color: {
                        dark: '#000000',
                        light: '#ffffff'
                    }
                });
                return Buffer.from(qrDataURL.split(',')[1], 'base64');
            } catch (err) {
                console.log("QR generation error:", err.message);
                return null;
            }
        };

        // Function to format currency with Rs.
        const formatCurrency = (value) => {
            const num = parseFloat(value || 0);
            if (isNaN(num)) return 'Rs. 0.00';
            const formatted = num.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
            return `Rs. ${formatted}`;
        };

        // Function to format quota with proper name
        const formatQuota = (quotaCode) => {
            if (!quotaCode) return 'GENERAL QUOTA (GN)';
            const quotaCodeUpper = String(quotaCode).toUpperCase().trim();
            let quotaName = trainQuotaList[quotaCodeUpper] || quotaCodeUpper;
            quotaName = quotaName.toUpperCase().replace(' QUOTA', '');
            return `${quotaName} QUOTA (${quotaCodeUpper})`;
        };

        // Function to format class with proper name
        const formatClass = (classCode) => {
            if (!classCode) return 'N/A';
            const classCodeUpper = String(classCode).toUpperCase().trim();
            const className = trainCabinClasses[classCodeUpper] || classCodeUpper;
            return `${className} (${classCodeUpper})`;
        };

        try {
            drawPageBorder();

            // ===================== HEADER WITH LOGOS =====================
            const leftLogoURL = process.env.TRAINLEFTLOGOURL;
            const middleLogoURL = process.env.TRAINMIDDLELOGOURL;
            const rightLogoURL = process.env.TRAINRIGHTLOGOURL;
            const arrowURL = process.env.TRAINARROWURL;

            // Title
            doc.fontSize(8)
                .font('Helvetica-Bold')
                .text('Electronic Reservation Slip (ERS)', margin, y, {
                    width: usableWidth,
                    align: 'center',
                    underline: true
                });
            y += 15;

            // Calculate column widths for 3 equal columns
            const colWidth = usableWidth / 3;
            const col1X = margin + 10;
            const col2X = margin + colWidth;
            const col3X = margin + (colWidth * 2) - 10;

            // Add logos in 3 columns
            try {
                const leftLogo = await loadImage(leftLogoURL);
                const middleLogo = await loadImage(middleLogoURL);
                const rightLogo = await loadImage(rightLogoURL);

                doc.image(leftLogo, col1X, y, { width: 60 });
                doc.image(middleLogo, col2X + (colWidth / 2) - 80, y, { width: 160 });
                doc.image(rightLogo, col3X + colWidth - 70, y, { width: 60 });

            } catch (err) {
                console.log("Logo load error:", err.message);
            }

            y += 75;

            // ===================== BOARDING / TO SECTION =====================
            doc.fontSize(10).font('Helvetica-Bold');
            const fromHeaderWidth = doc.widthOfString('Boarding From');
            doc.text('Boarding From', col1X + (colWidth / 2) - (fromHeaderWidth / 2) - 10, y);

            const toHeaderWidth = doc.widthOfString('To');
            doc.text('To', col3X + (colWidth / 2) - (toHeaderWidth / 2) + 10, y);
            y += 14;

            doc.fontSize(9).font('Helvetica');
            const fromStation = `${safeText(ticket.dep_station_name)}(${safeText(ticket.dep_station_code)})`;
            const fromStationWidth = doc.widthOfString(fromStation);
            doc.text(fromStation, col1X + (colWidth / 2) - (fromStationWidth / 2) - 10, y);

            const toStation = `${safeText(ticket.arr_station_name)}(${safeText(ticket.arr_station_code)})`;
            const toStationWidth = doc.widthOfString(toStation);
            doc.text(toStation, col3X + (colWidth / 2) - (toStationWidth / 2) + 10, y);
            y += 14;

            doc.fontSize(8).font('Helvetica');
            const departureText = `Departure* ${formatDateTime(ticket.dep_ts)}`;
            const departureWidth = doc.widthOfString(departureText);
            doc.text(departureText, col1X + (colWidth / 2) - (departureWidth / 2) - 10, y);

            const arrivalText = `Arrival* ${formatDateTime(ticket.arr_ts)}`;
            const arrivalWidth = doc.widthOfString(arrivalText);
            doc.text(arrivalText, col3X + (colWidth / 2) - (arrivalWidth / 2) + 10, y);

            try {
                const arrowImg = await loadImage(arrowURL);
                doc.image(arrowImg, col2X + (colWidth / 2) - 45, y - 20, { width: 90 });
            } catch (err) {
                console.log("Arrow load error:", err.message);
            }

            y += 25;
            drawHorizontalLine(y, 2);
            y += 12;

            // ===================== 3-COLUMN FORMAT =====================
            doc.fontSize(9).font('Helvetica');

            const trainColWidth = (usableWidth - 50) / 3;
            const trainCol1X = margin;
            const trainCol2X = margin + trainColWidth + 25;
            const trainCol3X = margin + (trainColWidth * 2) + 50;

            const trainNumber = safeText(ticket.train_number) || '';
            const trainName = safeText(ticket.train_name) || '';
            const trainDisplay = trainNumber && trainName ? `${trainNumber}/${trainName}` : (trainNumber || trainName || 'N/A');

            const classCode = safeText(ticket.j_class || ticket.class || '');
            const classDisplay = formatClass(classCode);

            const quotaCode = safeText(ticket.j_quota || '');
            const quotaDisplay = formatQuota(quotaCode);

            const distanceDisplay = safeText(ticket.distance) ? `${safeText(ticket.distance)} KM` : 'N/A';
            const printingTime = formatDate(new Date());

            // ROW 1 - Headers
            doc.font('Helvetica-Bold');

            const header1Width = doc.widthOfString('PNR');
            doc.text('PNR', trainCol1X + (trainColWidth / 2) - (header1Width / 2), y);

            const header2Width = doc.widthOfString('Train No./Name');
            doc.text('Train No./Name', trainCol2X + (trainColWidth / 2) - (header2Width / 2), y);

            const header3Width = doc.widthOfString('Class');
            doc.text('Class', trainCol3X + (trainColWidth / 2) - (header3Width / 2), y);
            y += 15;

            // ROW 1 - Values
            doc.font('Helvetica');

            doc.fillColor('#0066cc');
            const pnrWidth = doc.widthOfString(safeText(ticket.pnr_number || ''));
            doc.text(safeText(ticket.pnr_number || ''), trainCol1X + (trainColWidth / 2) - (pnrWidth / 2), y);

            doc.fillColor('black');
            const trainWidth = doc.widthOfString(trainDisplay);
            doc.text(trainDisplay, trainCol2X + (trainColWidth / 2) - (trainWidth / 2), y);

            const classWidth = doc.widthOfString(classDisplay);
            doc.text(classDisplay, trainCol3X + (trainColWidth / 2) - (classWidth / 2), y);
            y += 15;

            // ROW 2 - Headers
            doc.font('Helvetica-Bold');

            const quotaHeaderWidth = doc.widthOfString('Quota');
            doc.text('Quota', trainCol1X + (trainColWidth / 2) - (quotaHeaderWidth / 2), y);

            const distanceHeaderWidth = doc.widthOfString('Distance');
            doc.text('Distance', trainCol2X + (trainColWidth / 2) - (distanceHeaderWidth / 2), y);

            const timeHeaderWidth = doc.widthOfString('Ticket Printing Time');
            doc.text('Ticket Printing Time', trainCol3X + (trainColWidth / 2) - (timeHeaderWidth / 2), y);
            y += 15;

            // ROW 2 - Values
            doc.font('Helvetica');

            const quotaWidth = doc.widthOfString(quotaDisplay);
            doc.text(quotaDisplay, trainCol1X + (trainColWidth / 2) - (quotaWidth / 2), y);

            const distanceWidth = doc.widthOfString(distanceDisplay);
            doc.text(distanceDisplay, trainCol2X + (trainColWidth / 2) - (distanceWidth / 2), y);

            const printingTimeWithHrs = printingTime + ' Hrs';
            const timeWidth = doc.widthOfString(printingTimeWithHrs);
            doc.text(printingTimeWithHrs, trainCol3X + (trainColWidth / 2) - (timeWidth / 2), y);

            y += 18;
            drawHorizontalLine(y, 1);
            y += 12;

            // ===================== PASSENGER DETAILS TABLE =====================
            checkAndAddPage(20);
            doc.fontSize(9).font('Helvetica-Bold').text('Passenger Details:', margin, y);
            y += 14;

            const passColWidths = {
                sno: 40, name: 100, age: 40, gender: 85, booking: 130, current: 130
            };

            // Table header
            checkAndAddPage(20);
            doc.rect(margin, y - 2, usableWidth, 14).fill('#e8e8e8');
            doc.fillColor('black').fontSize(7).font('Helvetica-Bold');

            let xPos = margin + 3;
            doc.text('#', xPos, y, { width: passColWidths.sno, align: 'center' });
            xPos += passColWidths.sno;
            doc.text('Name', xPos, y, { width: passColWidths.name, align: 'left' });
            xPos += passColWidths.name;
            doc.text('Age', xPos, y, { width: passColWidths.age, align: 'center' });
            xPos += passColWidths.age;
            doc.text('Gender', xPos, y, { width: passColWidths.gender, align: 'center' });
            xPos += passColWidths.gender;
            doc.text('Booking Status', xPos, y, { width: passColWidths.booking, align: 'center' });
            xPos += passColWidths.booking;
            doc.text('Current Status', xPos, y, { width: passColWidths.current, align: 'right' });

            y += 14;
            drawHorizontalLine(y, 1);
            y += 6;

            // Passenger rows
            doc.fontSize(7).font('Helvetica');
            if (passengers && passengers.length > 0) {
                passengers.forEach((p, idx) => {
                    checkAndAddPage(25);

                    xPos = margin + 3;

                    const bookingStatus = [
                        p.booking_berth_coach_id,
                        p.bookingStatus || p.status,
                        p.booking_berth_no,
                        p.booking_berth_code
                    ].filter(Boolean).join('/') || '-';

                    const currentStatus = [
                        p.current_berth_coach_id,
                        p.status,
                        p.current_berth_no,
                        p.current_berth_code
                    ].filter(Boolean).join('/') || '-';

                    doc.text(String(idx + 1), xPos, y, { width: passColWidths.sno, align: 'center' });
                    xPos += passColWidths.sno;

                    const passengerName = safeText(p.name).toUpperCase();
                    doc.text(passengerName, xPos, y, { width: passColWidths.name, align: 'left' });
                    xPos += passColWidths.name;

                    doc.text(safeText(p.age), xPos, y, { width: passColWidths.age, align: 'center' });
                    xPos += passColWidths.age;

                    const genderText = p.gender === 'M' ? 'MALE' : p.gender === 'F' ? 'FEMALE' : safeText(p.gender).toUpperCase();
                    doc.text(genderText, xPos, y, { width: passColWidths.gender, align: 'center' });
                    xPos += passColWidths.gender;

                    doc.text(bookingStatus, xPos, y, { width: passColWidths.booking, align: 'center' });
                    xPos += passColWidths.booking;

                    doc.text(currentStatus, xPos, y, { width: passColWidths.current, align: 'right' });

                    y += 12;
                });

                // Extra spacing after table
                y += 8;
            } else {
                doc.text('No passenger details available', margin + 5, y);
                y += 12;
                y += 4;
            }

            // Line after passenger table
            checkAndAddPage(20);
            drawHorizontalLine(y, 1);
            y += 12;

            // ===================== ACRONYMS =====================
            checkAndAddPage(20);
            doc.fontSize(7).font('Helvetica');
            doc.text('Acronyms:', margin, y);
            doc.text('RLWL: REMOTE LOCATION WAITLIST', margin + 50, y);
            doc.text('RSWL: ROAD-SIDE WAITLIST', margin + 230, y);
            doc.text('PQWL: POOLED QUOTA WAITLIST', pageWidth - margin - 160, y, { width: 160, align: 'right' });

            y += 12;
            drawHorizontalLine(y, 1);
            y += 12;

            // ===================== TRANSACTION ID =====================
            checkAndAddPage(20);
            doc.fontSize(8).font('Helvetica-Bold');
            const displayId = ticket.reservation_id || ticket.transaction_id || 'N/A';
            doc.text(`Transaction Id-(Reservation_Id): ${safeText(displayId)}`, margin, y);
            y += 12;

            doc.fontSize(7).font('Helvetica');
            doc.text('IR recovers only 57% of cost of travel on an average.', margin, y);
            y += 15;

            // ===================== PAYMENT DETAILS WITH QR CODE =====================
            checkAndAddPage(30);
            const payColWidth = usableWidth / 3;
            const payCol1X = margin + 20;
            const payCol2X = margin + 30 + payColWidth;
            const payCol3X = margin + (payColWidth * 2);
            const payCol11X = margin + 0;

            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Payment Details:', payCol11X, y);

            // QR Code generation
            try {
                const passengerName = passengers && passengers.length > 0 ? passengers[0].name : 'Unknown';
                const passengerGender = passengers && passengers.length > 0 ?
                    (passengers[0].gender === 'M' ? 'Male' : passengers[0].gender === 'F' ? 'Female' : 'Unknown') : 'Unknown';
                const passengerAge = passengers && passengers.length > 0 ? passengers[0].age : 'Unknown';

                const journeyDateTime = formatDateTime(ticket.dep_ts);
                const journeyDate = journeyDateTime.split('  ')[1] || 'Unknown';
                const departureTime = journeyDateTime.split('  ')[0] || '';

                const firstPassenger = passengers && passengers.length > 0 ? passengers[0] : null;
                let fullStatus = '';
                if (firstPassenger) {
                    const statusParts = [
                        firstPassenger.current_berth_coach_id || firstPassenger.booking_berth_coach_id,
                        firstPassenger.status || firstPassenger.bookingStatus,
                        firstPassenger.current_berth_no || firstPassenger.booking_berth_no,
                        firstPassenger.current_berth_code || firstPassenger.booking_berth_code
                    ].filter(Boolean);
                    fullStatus = statusParts.join('/') || firstPassenger.status || 'CNF';
                }

                const ticketFare = parseFloat(ticket.ticket_fare || ticket.total_fare || ticket.base_fare || 0);
                const irctcFee = parseFloat(ticket.irctc_fee || 0) + parseFloat(ticket.wp_service_charge || 0) + parseFloat(ticket.wp_service_tax || 0);
                const agentCharge = parseFloat(ticket.agent_charge || ticket.travel_agent_service_charge || 0);
                const insuranceFee = parseFloat(ticket.insurance || ticket.insurance_charge || 0) + parseFloat(ticket.insurance_tax || 0);
                const pgCharges = parseFloat(ticket.pg_charge || ticket.agent_pg_charge || 0);

                let totalFare = parseFloat(ticket.total_collectible_amount || ticket.api_total_display_train_fare || 0);
                if (totalFare === 0 || isNaN(totalFare)) {
                    totalFare = ticketFare + irctcFee + agentCharge + insuranceFee + pgCharges;
                }

                const transactionId = ticket.reservation_id || ticket.transaction_id || 'N/A';

                const qrText = `PNR No:${ticket.pnr_number},   
                    TXN ID:${transactionId}, 
                    Passenger Name:${passengerName},  
                    Gender:${passengerGender}, 
                    Age:${passengerAge}, 
                    Status:${fullStatus}, 
                    Quota:${formatQuota(quotaCode)}, 
                    Train Number:${trainNumber}, 
                    Train Name:${trainName}, 
                    Scheduled Departure:${departureTime}, 
                    From:${ticket.dep_station_name} (${ticket.dep_station_code || ''}), 
                    To:${ticket.arr_station_name} (${ticket.arr_station_code || ''}), 
                    Date of Journey:${journeyDate}, 
                    Class:${formatClass(classCode)}, 
                    Ticket Fare:Rs.${Math.round(ticketFare)}
                    IRCTC SC: Rs.${irctcFee.toFixed(2)} + PG Charges Extra.`;

                const qrBuffer = await generateQRBuffer(qrText);

                if (qrBuffer) {
                    doc.image(qrBuffer, payCol3X + (payColWidth / 2) - 37, y - 5, {
                        width: 75,
                        height: 75
                    });
                }
            } catch (qrError) {
                console.error("QR Generation Error:", qrError);
            }

            y += 20;

            // Fare details
            doc.fontSize(8).font('Helvetica');

            const ticketFare = parseFloat(ticket.ticket_fare || ticket.total_fare || ticket.base_fare || 0);
            const irctcFee = parseFloat(ticket.irctc_fee || 0) + parseFloat(ticket.wp_service_charge || 0) + parseFloat(ticket.wp_service_tax || 0);
            const agentCharge = parseFloat(ticket.agent_charge || ticket.travel_agent_service_charge || 0);
            const insuranceFee = parseFloat(ticket.insurance || ticket.insurance_charge || 0) + parseFloat(ticket.insurance_tax || 0);
            const pgCharges = parseFloat(ticket.pg_charge || ticket.agent_pg_charge || 0);

            let totalFare = parseFloat(ticket.total_collectible_amount || ticket.api_total_display_train_fare || 0);
            if (totalFare === 0 || isNaN(totalFare)) {
                totalFare = ticketFare + irctcFee + agentCharge + insuranceFee + pgCharges;
            }

            const fareLabels = ['Ticket Fare:', 'IRCTC Convenience Fee:', 'Agent Service Charge:', 'Travel Insurance Premium:', 'PG Charges:', 'Total Fare:'];
            const fareValues = [
                formatCurrency(ticketFare),
                formatCurrency(irctcFee),
                formatCurrency(agentCharge),
                formatCurrency(insuranceFee),
                formatCurrency(pgCharges),
                formatCurrency(totalFare)
            ];

            let payY = y;
            for (let i = 0; i < fareLabels.length; i++) {
                doc.text(fareLabels[i], payCol1X, payY);

                if (i === fareLabels.length - 1) {
                    doc.font('Helvetica-Bold');
                    doc.text(fareValues[i], payCol2X + 20, payY);
                    doc.font('Helvetica');
                } else {
                    doc.text(fareValues[i], payCol2X + 20, payY);
                }
                payY += 12;
            }

            y = payY + 6;

            // Additional payment info
            checkAndAddPage(20);
            doc.fontSize(7).font('Helvetica');
            doc.text('PG Charges as applicable (Additional) (In case of Non RDS, and B2C)', margin, y, { width: usableWidth });
            y += 12;

            doc.text('* IRCTC Convenience Fee & Agent Service Charges are charged per e-ticket irrespective of no.of passengers on the ticket.', margin, y, { width: usableWidth });
            y += 12;

            doc.text(`* In case of cancellation of the ticket, a refund code will be sent to the passenger's mobile number ${safeText(ticket.phone || '9425180583')} entered at the time of booking. To receive the refund, passenger is required to provide this code to the agent who booked the ticket. The code is valid for 30 days from the cancellation date.`, margin, y, { width: usableWidth });
            y += 18;

            drawHorizontalLine(y, 1);
            y += 15;

            // ===================== AGENT DETAILS =====================
            checkAndAddPage(30);
            const payCol111X = margin + 20;
            doc.fontSize(9).font('Helvetica-Bold').text(`AGENT DETAILS: ${safeText(ticket.agency_name) || 'SATT TRAVELS'}`, margin, y);
            y += 14;

            doc.fontSize(7).font('Helvetica');

            doc.text('Principal Agent Name:', payCol111X, y);
            doc.text(safeText(ticket.principle_agent_name) || 'Simplyyatra Tour Travels Pvt Ltd.', margin + 110, y);
            y += 10;

            doc.text('Customer care Email:', payCol111X, y);
            doc.text(safeText(ticket.agency_email) || 'testbyarrol@gmail.com', margin + 110, y);
            doc.text('Customer Care Contact:', margin + 280, y);
            doc.text(safeText(ticket.agency_phone) || '9977228908', margin + 390, y);
            y += 10;

            doc.text('RSP Id:', payCol111X, y);
            doc.text(safeText(ticket.irctc_username) || 'WSMPLYY00595', margin + 110, y);
            doc.text('RSP Name:', margin + 280, y);
            const rspName = safeText(ticket.first_name) + ' ' + safeText(ticket.last_name) || 'MOHIT BUDHRANI';
            doc.text(rspName, margin + 390, y);
            y += 10;

            doc.text('RSP Address:', payCol111X, y);
            const address = safeText(ticket.address) || 'WARD NO 47 TIRTHANI GALI SARKANDA SARKANDA SATT TRAVELS BILASPUR';
            doc.text(address, margin + 110, y, { width: 380 });

            y += 25;
            drawHorizontalLine(y, 1);
            y += 12;

            doc.text('* Prescribed original ID proof is required while travelling along with SMS/ VRM/ ERS otherwise will be treated as without ticket and penalized as per Railway Rules.', margin, y, { width: usableWidth, align: 'justify' });
            y += 20;

            // ===================== GST SECTION =====================
            const hasGST = ticket.invoice_number;
            if (hasGST) {
                // Check if enough space for GST + Instructions together on same page
                const estimatedTotalHeight = 350; // GST + Instructions के लिए estimated height

                if (y + estimatedTotalHeight > pageHeight - 40) {
                    // Agar jagah nahi hai to naya page
                    doc.addPage();
                    y = 30;
                    pageCount++;
                    drawPageBorder();
                }
                // Agar jagah hai to same page continue

                const gstMargin = margin + 20;
                doc.fontSize(9).font('Helvetica-Bold');
                doc.text('Indian Railways GST Details:', margin, y);
                y += 12;

                doc.fontSize(8).font('Helvetica');
                doc.text(`Invoice Number: ${safeText(ticket.invoice_number)}`, gstMargin, y);
                doc.text('Address: Indian Railways New Delhi', pageWidth / 2, y);
                y += 18;

                doc.font('Helvetica-Bold').text('Supplier Information:', gstMargin, y);
                y += 12;
                doc.font('Helvetica');
                doc.text(`SAC Code: ${safeText(ticket.sac_code)}`, gstMargin, y);
                doc.text(`GSTIN: ${safeText(ticket.gstin_suplier)}`, pageWidth / 2, y);
                y += 18;

                doc.font('Helvetica-Bold').text('Recipient Information:', gstMargin, y);
                y += 12;
                doc.font('Helvetica');
                doc.text(`GSTIN: ${safeText(ticket.gst_no)}`, gstMargin, y);
                y += 10;
                doc.text(`Name: ${safeText(ticket.gst_name)}`, gstMargin, y);
                doc.text('Address:', pageWidth / 2, y);
                y += 10;
                doc.text(`Taxable Value: Rs. ${parseFloat(ticket.taxable_amt || 0).toFixed(2)}`, gstMargin, y);
                y += 10;
                doc.text(`CGST Rate: ${parseFloat(ticket.cgst_rate || 0).toFixed(2)}%`, gstMargin, y);
                doc.text(`CGST Amount: Rs. ${parseFloat(ticket.prs_cgst_charge || 0).toFixed(2)}`, pageWidth / 2, y);
                y += 10;

                const sgstRate = ticket.prs_sgst_charge > 0 ? ticket.sgst_rate : ticket.ugst_rate;
                const sgstAmount = ticket.prs_sgst_charge > 0 ? ticket.prs_sgst_charge : ticket.prs_ugst_charge;

                doc.text(`SGST/UGST Rate: ${parseFloat(sgstRate || 0).toFixed(2)}%`, gstMargin, y);
                doc.text(`SGST/UGST Amount: Rs. ${parseFloat(sgstAmount || 0).toFixed(2)}`, pageWidth / 2, y);
                y += 10;
                doc.text(`IGST Rate: ${parseFloat(ticket.igst_rate || 0).toFixed(2)}%`, gstMargin, y);
                doc.text(`IGST Amount: Rs. ${parseFloat(ticket.prs_igst_charge || 0).toFixed(2)}`, pageWidth / 2, y);
                y += 10;
                doc.font('Helvetica-Bold');
                doc.text(`Total Tax: Rs. ${parseFloat(ticket.total_prs_gst || 0).toFixed(2)}`, gstMargin, y);
                y += 18;

                doc.font('Helvetica');
                doc.text(`Place of Supply: ${safeText(ticket.agency_state_name)}`, gstMargin, y);
                doc.text('State Code/Name of Supplier: 0', pageWidth / 2, y);
                y += 15;
            }

            // ===================== INSTRUCTIONS =====================
            // Check if enough space for instructions on same page
            if (y + 250 > pageHeight - 40) {  // Agar jagah nahi hai to naya page
                doc.addPage();
                y = 30;
                pageCount++;
                drawPageBorder();
            }
            // Agar jagah hai to same page continue

            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('INSTRUCTIONS:', margin, y);
            y += 14;

            doc.fontSize(6.5).font('Helvetica');
            const instructions = [
                "1. Prescribed Original ID proofs are:- Voter Identity Card / Passport / PAN Card / Driving License / Photo ID card issued by Central / State Govt. / Public Sector Undertakings of State / Central Government, District Administrations , Municipal bodies and Panchayat Administrations which are having serial number / Student Identity Card with photograph issued by recognized School or College for their students / Nationalized Bank Passbook with photograph /Credit Cards issued by Banks with laminated photograph/Unique Identification Card \"Aadhaar\", m- Aadhaar, e- Aadhaar. /Passenger showing the Aadhaar/Driving Licence from the \"Issued Document\" section by logging into his/her DigiLocker account considered as valid proof of identity. (Documents uploaded by the user i.e. the document in \"Uploaded Document\" section will not be considered as a valid proof of identity).",
                "2. PNRS having fully waitlisted status will be dropped and automatic refund of the booking amount shall be credited to the account used for payment for booking of the ticket. Fully waitlisted e-ticket are not allowed to board the train. However, the names of PARTIALLY waitlisted/confirmed and RAC ticket passenger will appear in the chart and will be allowed to board the train.",
                "3. Passengers travelling on a fully waitlisted e-ticket will be treated as Ticketless.",
                "4. Obtain certificate from the TTE /Conductor in case of (a) PARTIALLY waitlisted e-ticket when LESS NO. OF PASSENGERS travel, (b)A.C FAILURE, (c) TRAVEL IN LOWER CLASS. This original certificate must be sent to GGM (IT), IRCTC, Internet Ticketing Centre, IRCA Building, State Entry Road, New Delhi-110055 after filing TDR online within prescribed time for claiming refund.",
                "5. In case, on a party e-ticket or a family e-ticket issued for travel of more than one passenger, some passengers have confirmed reservation and others are on RAC or waiting list, full refund of fare, less clrge, shall be admissible for confirmed passengers also subject to the condition that the ticket shall be cancelled online or online TDR shall be filed for all the passengers upto thirty minutes before the scheduled departure of the train.",
                "6. In case of train cancellation on its entire run, full refund is granted automatically by the system. However, if the train is cancelled partially on its run or diverted and not touching boarding/destination station, passengers are required to file online TDR within 72 hours of scheduled departure of the train from passengers boarding station.",
                "7. Never purchase e-ticket from unauthorized agents or persons using their personal IDs for commercial purposes. Such tickets are liable to be cancelled and forfeited without any refund of money, under section (143) of the Indian Railway Act 1989. List of authorized agents are available on www.irctc.com E- Ticket Agent Locator",
                "8. For detail, Rules, Refund rules, Terms & Conditions of E- Ticketing services, Travel Insurance facility etc. Please visit www.irctc.co.in",
                "9. While booking this ticket, you have agreed of having read the Health Protocol of Destination State of your travel. You are again advised to clearly read the Health Protocol advisory of destination state before start of your travel and follow them properly.",
                "10. The FIR forms are available with on board ticket checking staff, train guard and train escorting RPF/GRP staff.",
                "11. Variety of meals available in more than 1500 trains. For delivery of meal of your choice on your seat log on to www.ecatering.irctc.co.in or call 1323 Toll Free. For any suggestions/complaints related to Catering services, contact Toll Free No. 1800-111-321 (07.00 hrs to 22.00 hrs)",
                "12. E- ticket cancellations are permitted through respective agent only.",
                "13. Agent Service Charge for E- Ticket inclusive of tax (non- refundable) Class Service Charge Non-AC class Rs.20/- AC class including FC Rs.40/-",
                "14. National Consumer Helpline (NCH) Toll Free Number: 1800-11-400 or 14404",
                "15. You can book unreserved ticket from UTS APP or ATVMs (Automatic Ticket Vending Machines) located in Railway Stations.",
                "16. The printed Departure and Arrival Times are liable to change. Please Check correct departure, arrival from Railway Station Enquiry or Dial 139 or SMS RAIL to 139."
            ];

            instructions.forEach((instruction) => {
                const textHeight = doc.heightOfString(instruction, {
                    width: usableWidth - 10,
                    align: 'left'
                });

                if (y + textHeight + 8 > pageHeight - 40) {
                    doc.addPage();
                    y = 30;
                    pageCount++;
                    drawPageBorder();
                }

                doc.text(instruction, margin + 5, y, {
                    width: usableWidth - 10,
                    align: 'left',
                    lineGap: 1
                });

                y += textHeight + 4;
            });

            y += 3;

            // ===================== CONTACT INFORMATION =====================
            if (y + 30 > pageHeight - 40) {
                doc.addPage();
                y = 30;
                pageCount++;
                drawPageBorder();
            }

            doc.fontSize(7).font('Helvetica-Bold');
            const contactText = "For e-ticket booking ,cancellation and refund assistance , Please contact us at 14646 / 08044647999 /08035734999 or raise query at https://equery.irctc.co.in";

            const contactHeight = doc.heightOfString(contactText, {
                width: usableWidth,
                align: 'left'
            });

            doc.text(contactText, margin, y, {
                width: usableWidth,
                align: 'left',
                lineGap: 1
            });

            y += contactHeight + 8;
            console.log(`PDF generated with ${pageCount} pages`);

        } catch (err) {
            console.error("PDF Generation Error:", err);
            doc.fontSize(12).text("Error generating ticket", 100, 100);
            doc.fontSize(8).text(`Error: ${err.message}`, 100, 120);
        }
    }









}
module.exports = new TravelportAdapter();
