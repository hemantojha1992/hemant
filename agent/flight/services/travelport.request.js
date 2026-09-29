const { generateAppTransactionReference } = require("../../helper/app_helper");
const { getCacheData } = require("../../../shared/redis/Redis");
const xml2js = require('xml2js');

async function getFlighstSearchRequest(searchData) {
    const app_reference = await getCacheData('app_reference');/// generateAppTransactionReference('NFB');
    const searchLegs = [
        {
            'air:SearchOrigin': {
                'common:CityOrAirport': { $: { Code: searchData.from.toUpperCase() } }
            },
            'air:SearchDestination': {
                'common:CityOrAirport': { $: { Code: searchData.to.toUpperCase() } }
            },
            'air:SearchDepTime': {
                $: { PreferredTime: searchData.departure }
            }
        }
    ];

    if (searchData.return) {
        searchLegs.push({
            'air:SearchOrigin': {
                'common:CityOrAirport': { $: { Code: searchData.to } }
            },
            'air:SearchDestination': {
                'common:CityOrAirport': { $: { Code: searchData.from } }
            },
            'air:SearchDepTime': {
                $: { PreferredTime: searchData.return }
            }
        });
    }
    //search passenger 

    const passengers = [];

    if (searchData.adult && Number(searchData.adult) > 0) {
        for (let i = 0; i < Number(searchData.adult); i++) {
            passengers.push({
                "common:SearchPassenger": {
                    $: {
                        Code: "ADT",
                        BookingTravelerRef: `ADT_${i}`
                    }
                }
            });
        }
    }

    if (searchData.child && Number(searchData.child) > 0) {
        for (let i = 0; i < Number(searchData.child); i++) {
            passengers.push({
                "common:SearchPassenger": {
                    $: {
                        Code: "CHD",
                        BookingTravelerRef: `CHD_${i}`
                    }
                }
            });
        }
    }

    if (searchData.infant && Number(searchData.infant) > 0) {
        for (let i = 0; i < Number(searchData.infant); i++) {
            passengers.push({
                "common:SearchPassenger": {
                    $: {
                        Code: "INF",
                        BookingTravelerRef: `INF_${i}`
                    }
                }
            });
        }
    }
    // AirSearchModifiers
    const airSearchModifiers = {
        "air:AirSearchModifiers": {
            "air:PreferredProviders": {
                "common:Provider": {
                    $: { Code: searchData.provider ?? 'ACH' }
                }
            }
        }
    };

    // AirPricingModifiers
    const airPricingModifiers = {
        "air:AirPricingModifiers": {
            $: { FaresIndicator: "AllFares", ETicketability: "Yes" }
        }
    };

    if (searchData.provider === '1G' && Array.isArray(searchData.accountCodes) && searchData.accountCodes.length > 0) {
        // airPricingModifiers["air:AirPricingModifiers"]["air:AccountCodes"] = {
        //     "common:AccountCode": searchData.accountCodes.map(code => ({
        //         $: {
        //             Code: code
        //         }
        //     }))
        // };
    }
    // Main request body
    const lowFareSearchRequest = {
        "air:LowFareSearchReq": {
            $: {
                TraceId: app_reference,
                TargetBranch: process.env.TARGTBRANCH,
                SolutionResult: "true",
                LanguageCode: "ENUS",
                ReturnUpsellFare: "true",
                CheckOBFees: "All"
            },
            "common:BillingPointOfSaleInfo": {
                $: { OriginApplication: "UAPI" }
            },
            "air:SearchAirLeg": searchLegs,
            ...airSearchModifiers,
            "common:SearchPassenger": passengers.map(p => p["common:SearchPassenger"]),
            ...airPricingModifiers
        }
    };

    // Wrap in SOAP envelope
    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common": "http://www.travelport.com/schema/common_v52_0"
            },
            "soapenv:Header": {
                // Add real SOAP headers here if needed
            },
            "soapenv:Body": lowFareSearchRequest
        }
    };

    const builder = new xml2js.Builder({
        headless: true,  
        renderOpts: { pretty: true }
    });

    const xmlRequest = builder.buildObject(requestSchema);
    // console.log(xmlRequest);
    return xmlRequest;
}
async function getFlighstSearchRequest_Premium(searchData) {
    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });

    const app_reference = await getCacheData("app_reference") ?? "FB-DEFAULT";

    // ==== Build Search Legs (with Premium Cabin) ====
    const searchLegs = [
        {
            'air:SearchOrigin': { 'common:CityOrAirport': { $: { Code: searchData.from } } },
            'air:SearchDestination': { 'common:CityOrAirport': { $: { Code: searchData.to } } },
            'air:SearchDepTime': { $: { PreferredTime: searchData.departure } },
            'air:AirLegModifiers': {
                'air:PreferredCabins': {
                    'CabinClass': { $: { xmlns: "http://www.travelport.com/schema/common_v52_0", Type: "PremiumEconomy" } }
                }  
            }
        }
    ];

    // Round-trip handling
    if (searchData.return) {
        searchLegs.push({
            'air:SearchOrigin': { 'common:CityOrAirport': { $: { Code: searchData.to } } },
            'air:SearchDestination': { 'common:CityOrAirport': { $: { Code: searchData.from } } },
            'air:SearchDepTime': { $: { PreferredTime: searchData.return } },
            'air:AirLegModifiers': {
                'air:PreferredCabins': {
                    'CabinClass': { $: { xmlns: "http://www.travelport.com/schema/common_v52_0", Type: "PremiumEconomy" } }
                }
            }
        });
    }

    // ==== Build Passengers ====
    const passengers = [];
    if (searchData.adult) for (let i = 0; i < Number(searchData.adult); i++) passengers.push({ $: { Code: "ADT", BookingTravelerRef: `ADT_${i}` } });
    if (searchData.child) for (let i = 0; i < Number(searchData.child); i++) passengers.push({ $: { Code: "CHD", BookingTravelerRef: `CHD_${i}` } });
    if (searchData.infant) for (let i = 0; i < Number(searchData.infant); i++) passengers.push({ $: { Code: "INF", BookingTravelerRef: `INF_${i}` } });

    const lowFareSearchRequest = {
        "air:LowFareSearchReq": {
            $: {
                TraceId: app_reference,
                TargetBranch: process.env.TARGTBRANCH,
                SolutionResult: "true",
                LanguageCode: "ENUS",
                ReturnUpsellFare: "true",
                CheckOBFees: "All"
            },
            "common:BillingPointOfSaleInfo": { $: { OriginApplication: "UAPI" } },
            "air:SearchAirLeg": searchLegs,
            "air:AirSearchModifiers": {
                "air:PreferredProviders": {
                    "common:Provider": { $: { xmlns: "http://www.travelport.com/schema/common_v52_0", Code: searchData.provider ?? "1G" } }
                }
            },
            "common:SearchPassenger": passengers,
            "air:AirPricingModifiers": { $: { FaresIndicator: "AllFares" } }
        }
    };

    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common": "http://www.travelport.com/schema/common_v52_0"
            },
            "soapenv:Header": {
                Action: {
                    $: { "soapenv:mustUnderstand": "1" },
                    xmlns: "http://schemas.microsoft.com/ws/2005/05/addressing/none",
                    _: "https://www.dreasyfly.co.in/index.php/flight/action"
                }
            },
            "soapenv:Body": lowFareSearchRequest
        }
    };

    return builder.buildObject(requestSchema);
}

async function getFlighstSearchRequest_GDSACC(searchData) {
    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });

    const app_reference = await getCacheData('app_reference') ?? "FB-DEFAULT";

    // ==== Build Search Leg ====
    const searchLegs = [
        {
            'air:SearchOrigin': {
                'common:CityOrAirport': { $: { Code: searchData.from } }
            },
            'air:SearchDestination': {
                'common:CityOrAirport': { $: { Code: searchData.to } }
            },
            'air:SearchDepTime': {
                $: { PreferredTime: searchData.departure }
            }
        }
    ];

    // ==== Build Passengers ====

    const passengers = [];
    if (searchData.adult) for (let i = 0; i < Number(searchData.adult); i++) passengers.push({ $: { Code: "ADT", BookingTravelerRef: `ADT_${i}` } });
    if (searchData.child) for (let i = 0; i < Number(searchData.child); i++) passengers.push({ $: { Code: "CHD", BookingTravelerRef: `CHD_${i}` } });
    if (searchData.infant) for (let i = 0; i < Number(searchData.infant); i++) passengers.push({ $: { Code: "INF", BookingTravelerRef: `INF_${i}` } });


    // ==== AirSearchModifiers ====
    const airSearchModifiers = {
        "air:AirSearchModifiers": {
            "air:PreferredProviders": {
                "common:Provider": { $: { xmlns: "http://www.travelport.com/schema/common_v52_0", Code: searchData.provider ?? "1G" } }
            }
        }
    };

    // ==== AirPricingModifiers ====
    const airPricingModifiers = {
        "air:AirPricingModifiers": {
            $: { FaresIndicator: "AllFares", AccountCodeFaresOnly: "true" },
            "air:AccountCodes": {
                "common:AccountCode": searchData.accountCodes?.map(code => ({ $: { Code: code } })) ?? [{ $: { Code: "SME" } }]
            }
        }
    };

    // ==== Main LowFareSearchReq ====
    const lowFareSearchRequest = {
        "air:LowFareSearchReq": {
            $: {
                TraceId: app_reference,
                TargetBranch: process.env.TARGTBRANCH,
                SolutionResult: "true",
                LanguageCode: "ENUS",
                ReturnUpsellFare: "true"
            },
            "common:BillingPointOfSaleInfo": { $: { OriginApplication: "UAPI" } },
            "air:SearchAirLeg": searchLegs,
            ...airSearchModifiers,
            "common:SearchPassenger": passengers,
            ...airPricingModifiers
        }
    };

    // ==== Wrap in SOAP Envelope ====
    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common": "http://www.travelport.com/schema/common_v52_0"
            },
            "soapenv:Header": {
                Action: {
                    $: { "soapenv:mustUnderstand": "1" },
                    xmlns: "http://schemas.microsoft.com/ws/2005/05/addressing/none",
                    _: "https://www.dreasyfly.co.in/index.php/flight/action"
                }
            },
            "soapenv:Body": lowFareSearchRequest
        }
    };

    // Convert JSON → XML
    const xmlRequest = builder.buildObject(requestSchema);
    return xmlRequest;
}

async function getFlighstSearchRequest_Business(searchData) {

    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });

    const app_reference = await getCacheData("app_reference") ?? "FB-DEFAULT";
    const passengers = [];
    if (searchData.adult) for (let i = 0; i < Number(searchData.adult); i++) passengers.push({ $: { Code: "ADT", BookingTravelerRef: `ADT_${i}` } });
    if (searchData.child) for (let i = 0; i < Number(searchData.child); i++) passengers.push({ $: { Code: "CHD", BookingTravelerRef: `CHD_${i}` } });
    if (searchData.infant) for (let i = 0; i < Number(searchData.infant); i++) passengers.push({ $: { Code: "INF", BookingTravelerRef: `INF_${i}` } });

    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common": "http://www.travelport.com/schema/common_v52_0"
            },

            "soapenv:Header": {
                Action: {
                    $: { "soapenv:mustUnderstand": "1" },
                    xmlns: "http://schemas.microsoft.com/ws/2005/05/addressing/none",
                    _: "https://www.dreasyfly.co.in/index.php/flight/action"
                }
            },

            "soapenv:Body": {
                "air:LowFareSearchReq": {
                    $: {
                        TraceId: app_reference,
                        TargetBranch: process.env.TARGTBRANCH,
                        SolutionResult: "true",
                        LanguageCode: "ENUS",
                        ReturnUpsellFare: "true",
                        CheckOBFees: "All"
                    },

                    "common:BillingPointOfSaleInfo": {
                        $: { OriginApplication: "UAPI" }
                    },

                    "air:SearchAirLeg": {
                        "air:SearchOrigin": {
                            "common:CityOrAirport": { $: { Code: searchData.from } }
                        },
                        "air:SearchDestination": {
                            "common:CityOrAirport": { $: { Code: searchData.to } }
                        },
                        "air:SearchDepTime": {
                            $: { PreferredTime: searchData.departure }
                        },
                        "air:AirLegModifiers": {
                            "air:PreferredCabins": {
                                "CabinClass": {
                                    $: {
                                        xmlns: "http://www.travelport.com/schema/common_v52_0",
                                        Type: searchData.cabin ?? "Business"
                                    }
                                }
                            }
                        }
                    },

                    "air:AirSearchModifiers": {
                        "air:PreferredProviders": {
                            "common:Provider": {
                                $: {
                                    xmlns: "http://www.travelport.com/schema/common_v52_0",
                                    Code: searchData.provider ?? "1G"
                                }
                            }
                        }
                    },

                    "common:SearchPassenger": passengers,
                    "air:AirPricingModifiers": {
                        $: { FaresIndicator: "AllFares" }
                    }
                }
            }
        }
    };

    return builder.buildObject(requestSchema);
}

async function getFlighstRePriceRequest(AirPriceRsp, aprResponse, opServices, app_reference) {
    //console.log('opServices',opServices);return false;
    delete AirPriceRsp.$;
    delete AirPriceRsp['air:OptionalServiceRules'];
    delete AirPriceRsp['OptionalServiceRules'];
    delete AirPriceRsp['air:OptionalServices'];
    delete AirPriceRsp['OptionalServices'];
    const toArray = (v) => Array.isArray(v) ? v : [v];

    if (opServices.length > 0) {
        const optionalServiceData = Array.isArray(opServices) ? opServices : [opServices];
        const segments = AirPriceRsp?.AirItinerary?.AirSegment;
        const passengersArr = toArray(AirPriceRsp?.['common:SearchPassenger']);
        const aprRespAprSolution = toArray(aprResponse?.['air:AirPriceResult']?.['air:AirPricingSolution']);

        let allPassengers = [];
        aprRespAprSolution.forEach(solution => {
            const apiRaw = solution['air:AirPricingInfo'];
            const airPricingInfos = Array.isArray(apiRaw) ? apiRaw : [apiRaw];

            airPricingInfos.forEach(info => {
                const ptRaw = info['air:PassengerType'];
                const passengerTypes = Array.isArray(ptRaw) ? ptRaw : [ptRaw];
                const mapped = passengerTypes.map(p => ({  code: p?.$?.Code, ref: p?.$?.BookingTravelerRef }));
                allPassengers.push(...mapped);
            });
        });
        AirPriceRsp['common:SearchPassenger'] = allPassengers.map(p => ({
            '$': {
                Code: p.code,
                BookingTravelerRef: p.ref
            }
        }));
        const AirSegmentPricingModifiersArr = toArray(AirPriceRsp?.AirPricingCommand?.['AirSegmentPricingModifiers']);
        AirSegmentPricingModifiersArr.forEach((mod, index) => {
            const flightRef = optionalServiceData[index]?.flight?.ref;
            if (mod?.$ && flightRef) {
                mod.$.AirSegmentRef = flightRef;
            }
        });
        if (!segments) return AirPriceRsp;
        const segmentList = Array.isArray(segments) ? segments : [segments];
        segmentList.forEach(segment => {
            const flightNumber = segment?.$?.FlightNumber;
            const origin = segment?.$?.Origin;
            const destination = segment?.$?.Destination;
            const route = `${origin}-${destination}`;
            const matched = optionalServiceData.find(item =>
                item?.flight?.flight_number === flightNumber &&
                item?.flight?.source === route
            );
            if (matched?.flight?.ref) {
                segment.$.Key = matched.flight.ref;
            }
        });

        // const FinalData = optionalServiceData.map(item => {
        //     const serviceObj = item.opService;
        //     return serviceObj;
        // });
        // if (FinalData?.length) {
        //     AirPriceRsp.OptionalServices = {
        //         "air:OptionalService": FinalData
        //     };
        // }
        const FinalData = [];
        const addedKeys = new Set();

        optionalServiceData.forEach((item ,i)=> {
            let serviceObj = JSON.parse(JSON.stringify(item.opService));
            let serviceData = toArray(serviceObj['common_v52_0:ServiceData']);
            // serviceObj['common_v52_0:ServiceData'] = serviceData.filter(sd =>
            //     sd.$.BookingTravelerRef === item.selectedPassengerRef &&
            //     sd.$.AirSegmentRef === item.selectedSegmentRef
            // );
            let selectedServiceData = [];
            for (const sd of serviceData) {
                
                if (sd?.$?.BookingTravelerRef === item.selectedPassengerRef && sd?.$?.AirSegmentRef === item.selectedSegmentRef ) {
                    selectedServiceData.push(sd);
                }
            }
            serviceObj['common_v52_0:ServiceData'] = selectedServiceData;
            const key = serviceObj?.$?.Key; 
            if (addedKeys.has(key)) {return;}
            addedKeys.add(key);
            FinalData.push(serviceObj);
        });
        if (FinalData.length) {
            AirPriceRsp.OptionalServices = {
                "air:OptionalService": FinalData
            };
        }
    }
    

    const rePriceRequest = {
        AirPriceReq: {
            $: {
                xmlns: "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                TraceId: app_reference,
                AuthorizedBy: "Travelport",
                TargetBranch: process.env.TARGTBRANCH,
                CheckOBFees: "All",
                FareRuleType: "short",
                "xsi:schemaLocation":
                    "http://www.travelport.com/schema/air_v52_0 AirReqRsp.xsd"
            },
            ...AirPriceRsp
        }
    };
    const requestSchema = {   
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:ses":
                    "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air":
                    "http://www.travelport.com/schema/air_v52_0",
                "xmlns:com":
                    "http://www.travelport.com/schema/common_v52_0"
            },
            "soapenv:Body": rePriceRequest
        }
    };
    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });
    const xmlRequest = builder.buildObject(requestSchema);
    return xmlRequest;
}



async function getFlighstAirPriceRequest(searchData, pIdHostToken, pIdfareInfo, segments, app_reference, APS, providerCode) {
    const toArray = (v) => Array.isArray(v) ? v : [v];
    const passengers = [];
    const pricingInfo = toArray(APS?.['air:AirPricingInfo']);
    for (const info of pricingInfo || []) {
        const PassengerType = toArray(info['air:PassengerType']);
        for (const pt of PassengerType || []) {
            passengers.push({
                code: pt.$?.Code,
                ref: "QURUXz" + (
                    Math.random().toString(36).substring(2) +
                    Math.random().toString(36).substring(2)
                ).substring(0, 18) //same optional service me send krna h
            });
        }
    }
    const AirItinerary = {
        AirSegment: (segments || []).map(seg => {
            const s = seg ?? {};
            const attr = s.$ ?? {};
            // const providerCode =
            //     s["air:AirAvailInfo"]?.$?.ProviderCode ||
            //     attr.ProviderCode ||
            //     "";
            const bookingCodes = [];
            const bookingInfo = bookingCodes.find(b => b.segmentRef === attr.Key);
            const bookingClass =
                bookingInfo?.code || attr.ClassOfService || attr.BookingCode || s.BookingCode || "";

            if (!bookingClass && providerCode === "1G") {
                throw new Error(" Missing ClassOfService for 1G segment, cannot proceed");
            }
            const segment = {
                $: {
                    Key: attr.Key || "",
                    Group: attr.Group || "",
                    Carrier: attr.Carrier || "",
                    FlightNumber: attr.FlightNumber || "",
                    Origin: attr.Origin || "",
                    Destination: attr.Destination || "",
                    DepartureTime: attr.DepartureTime || "",
                    ArrivalTime: attr.ArrivalTime || "",
                    FlightTime: attr.FlightTime || "",
                    Equipment: attr.Equipment || "",
                    ClassOfService: bookingClass,
                    ProviderCode: providerCode
                }
            };

            if (providerCode === "ACH") {
                segment.$.Status = attr.Status || "";
                segment.$.SupplierCode = attr.SupplierCode || "";
                segment.$.ChangeOfPlane = attr.ChangeOfPlane || "";
                segment.$.OptionalServicesIndicator = attr.OptionalServicesIndicator || "";
                segment.$.APISRequirementsRef = attr.APISRequirementsRef || "";
                segment.$.ParticipantLevel = "Secure Sell";
                segment.$.LinkAvailability = "true";
                segment.$.PolledAvailabilityOption = "Polled avail used";
                segment.$.AvailabilitySource = "S";
                segment.$.AvailabilityDisplayType = "Fare Shop/Optimal Shop";

                // if (attr.HostTokenRef) {
                //     segment.$.HostTokenRef = attr.HostTokenRef;
                // }

                for (const ht of pIdHostToken) {
                    if (attr.Key === ht.seg) {
                        segment.$.HostTokenRef = ht?.$?.Key;
                    }
                }
            }
            const finalSegment = {
                ...segment,
            };
            if (providerCode.toLowerCase() === "ach") {

                finalSegment['CodeshareInfo'] = {
                    $: {
                        OperatingCarrier: attr.Carrier || "",
                        OperatingFlightNumber: attr.FlightNumber || ""
                    }
                }


                finalSegment["AirAvailInfo"] = {
                    $: { ProviderCode: providerCode }
                };
                finalSegment.Connection = "";
            }



            return finalSegment;
        }),

        "common_v52_0:HostToken": (pIdHostToken || [])
            .filter(ht => ht?.$?.Key && ht?._)
            .map(ht => ({
                $: { Key: ht.$.Key },
                _: ht._
            }))
    };

    let AirPricingCommand = {};

    if (providerCode.toLowerCase() === '1g') {
        AirPricingCommand = {
            $: {
                xmlns: "http://www.travelport.com/schema/air_v52_0"
            },
            AirSegmentPricingModifiers: pIdfareInfo.map(p => ({
                $: {
                    AirSegmentRef: p?.AirSegmentRef || "",
                    FareBasisCode: p?.FareBasisCode || ""
                },
                PermittedBookingCodes: {
                    BookingCode: {
                        $: {
                            Code: p?.BookingCode || "C"   // agar dynamic ho to p se le lo
                        }
                    }
                }
            }))
        };

    } else {
        AirPricingCommand = {
            AirSegmentPricingModifiers: pIdfareInfo.map(p => ({
                $: {
                    AirSegmentRef: p?.AirSegmentRef || "",
                    FareBasisCode: p?.FareBasisCode || ""
                }
            }))
        };
    }

    const airPriceRequest = {
        "AirPriceReq": {
            $: {
                "xmlns": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                TraceId: app_reference,
                AuthorizedBy: "Travelport",
                TargetBranch: process.env.TARGTBRANCH,
                CheckOBFees: "All",
                FareRuleType: "short",
                "xsi:schemaLocation": "http://www.travelport.com/schema/air_v52_0 AirReqRsp.xsd"
            },
            "common:BillingPointOfSaleInfo": {
                $: { OriginApplication: "UAPI" }
            },
            AirItinerary,
            'common:SearchPassenger': passengers.map(p => ({
                $: {
                    Code: p?.code || "",
                    BookingTravelerRef: p?.ref || ""
                }
            })),
            AirPricingCommand,
            // "AirPricingCommand": {
            //     "AirSegmentPricingModifiers": pIdfareInfo.map(p => ({
            //         $: {
            //             AirSegmentRef: p?.AirSegmentRef || "",
            //             FareBasisCode: p?.FareBasisCode || ""
            //         }
            //     }))
            // }
        }
    };
    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:com": "http://www.travelport.com/schema/common_v52_0"
            },
            "soapenv:Body": airPriceRequest
        }
    };
    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });

    const xmlRequest = builder.buildObject(requestSchema);
    return xmlRequest;
}

async function getFlighstAirPriceRequestOld(searchData) {

    const priceId = Buffer.from(searchData.price_id, 'base64').toString('utf8');
    const flightData = await getCacheData(priceId);
    const bookingCodes = [];
    for (const solution of flightData.solutions || []) {
        const airPricingInfos = solution['air:AirPricingInfo'];
        if (!airPricingInfos) continue;
        const infos = Array.isArray(airPricingInfos) ? airPricingInfos : [airPricingInfos];
        for (const info of infos) {
            const bookingInfoList = info['air:BookingInfo'];
            if (!bookingInfoList) continue;
            const bookings = Array.isArray(bookingInfoList) ? bookingInfoList : [bookingInfoList];
            for (const b of bookings) {
                bookingCodes.push({
                    segmentRef: b.$?.SegmentRef,
                    code: b.$?.BookingCode,
                    cabinClass: b.$?.CabinClass
                });
            }
        }
    }

    //const passenger = flightData.passenger;
    //const hostToken = flightData.hostToken;
    const segments = flightData.segments;
    const fareInfo = flightData.fareInfo;
    const journey = flightData.journey;
    const app_reference = await getCacheData('app_reference');

    const passengerRaw = flightData.passenger;
    const passengers = Array.isArray(passengerRaw)
        ? passengerRaw
        : passengerRaw
            ? [passengerRaw]
            : [];

    const hostTokenRaw = flightData.hostToken;
    const hostTokens = Array.isArray(hostTokenRaw)
        ? hostTokenRaw
        : hostTokenRaw
            ? [hostTokenRaw]
            : [];


    const AirItinerary_back = {
        AirSegment: (segments || []).map(seg => {
            const s = seg ?? {};
            const attr = s.$ ?? {};

            const Pro_Code =
                s["air:AirAvailInfo"]?.$?.ProviderCode ||
                attr.ProviderCode ||
                ""; // fallback empty

            return {
                $: {
                    Key: attr.Key || "",
                    Group: attr.Group || "",
                    Carrier: attr.Carrier || "",
                    FlightNumber: attr.FlightNumber || "",
                    Origin: attr.Origin || "",
                    Destination: attr.Destination || "",
                    DepartureTime: attr.DepartureTime || "",
                    ArrivalTime: attr.ArrivalTime || "",
                    FlightTime: attr.FlightTime || "",
                    Equipment: attr.Equipment || "",
                    Status: attr.Status || "",
                    SupplierCode: attr.SupplierCode || "",
                    ChangeOfPlane: attr.ChangeOfPlane || "",
                    OptionalServicesIndicator: attr.OptionalServicesIndicator || "",
                    APISRequirementsRef: attr.APISRequirementsRef || "",
                    ClassOfService: "X",
                    ProviderCode: Pro_Code || "",
                    ParticipantLevel: "Secure Sell",
                    LinkAvailability: "true",
                    PolledAvailabilityOption: "Polled avail used",
                    AvailabilitySource: "S",
                    AvailabilityDisplayType: "Fare Shop/Optimal Shop",
                    HostTokenRef: attr.HostTokenRef || ""
                },

                CodeshareInfo: {
                    $: {
                        OperatingCarrier: attr.Carrier || "",
                        OperatingFlightNumber: attr.FlightNumber || ""
                    }
                },

                AirAvailInfo: {
                    $: {
                        ProviderCode: Pro_Code
                    }
                },

                Connection: ""
            };
        }),

        "common_v52_0:HostToken": hostTokens
            .filter(ht => ht?.$?.Key)
            .map(ht => ({
                $: { Key: ht.$.Key },
                _: ht?._ || ""
            }))

        // "common_v52_0:HostToken": (hostToken || []).map(ht => ({
        //     $: { Key: ht?.$?.Key || "" },
        //     _: ht?._ || ""
        // }))
    };
    const pricingCommand_back = {
        AirSegmentPricingModifiers: segments.map(seg => ({
            $: {
                AirSegmentRef: seg?.$?.Key,
                FareBasisCode: fareInfo.FareBasis
            }
        }))
    };

    const AirItinerary = {
        AirSegment: (segments || []).map(seg => {
            const s = seg ?? {};
            const attr = s.$ ?? {};

            // Detect provider
            const providerCode =
                s["air:AirAvailInfo"]?.$?.ProviderCode ||
                attr.ProviderCode ||
                "";
            const bookingInfo = bookingCodes.find(b => b.segmentRef === attr.Key);
            const bookingClass =
                bookingInfo?.code || attr.ClassOfService || attr.BookingCode || s.BookingCode || "";

            if (!bookingClass && providerCode === "1G") {
                throw new Error(" Missing ClassOfService for 1G segment, cannot proceed");
            }
            const segment = {
                $: {
                    Key: attr.Key || "",
                    Group: attr.Group || "",
                    Carrier: attr.Carrier || "",
                    FlightNumber: attr.FlightNumber || "",
                    Origin: attr.Origin || "",
                    Destination: attr.Destination || "",
                    DepartureTime: attr.DepartureTime || "",
                    ArrivalTime: attr.ArrivalTime || "",
                    FlightTime: attr.FlightTime || "",
                    Equipment: attr.Equipment || "",
                    ClassOfService: bookingClass,
                    ProviderCode: providerCode
                }
            };

            if (providerCode === "ACH") {
                segment.$.Status = attr.Status || "";
                segment.$.SupplierCode = attr.SupplierCode || "";
                segment.$.ChangeOfPlane = attr.ChangeOfPlane || "";
                segment.$.OptionalServicesIndicator = attr.OptionalServicesIndicator || "";
                segment.$.APISRequirementsRef = attr.APISRequirementsRef || "";
                segment.$.ParticipantLevel = "Secure Sell";
                segment.$.LinkAvailability = "true";
                segment.$.PolledAvailabilityOption = "Polled avail used";
                segment.$.AvailabilitySource = "S";
                segment.$.AvailabilityDisplayType = "Fare Shop/Optimal Shop";

                if (attr.HostTokenRef) {
                    segment.$.HostTokenRef = attr.HostTokenRef;
                }
            }

            const finalSegment = {
                ...segment,
                CodeshareInfo: {
                    $: {
                        OperatingCarrier: attr.Carrier || "",
                        OperatingFlightNumber: attr.FlightNumber || ""
                    }
                }
            };

            if (providerCode === "ACH") {
                finalSegment["AirAvailInfo"] = {
                    $: { ProviderCode: providerCode }
                };
            }

            finalSegment.Connection = "";

            return finalSegment;
        }),

        "common_v52_0:HostToken": (hostTokens || [])
            .filter(ht => ht?.$?.Key)
            .map(ht => ({
                $: { Key: ht.$.Key },
                _: ht?._ || ""
            }))
    };


    const pricingCommand = {
        AirSegmentPricingModifiers: segments.map(seg => ({
            $: {
                AirSegmentRef: seg?.$?.Key,
                FareBasisCode: fareInfo.FareBasis
            }
        }))
    };

    const airPriceRequest = {
        "AirPriceReq": {
            $: {
                "xmlns": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                TraceId: app_reference,
                AuthorizedBy: "Travelport",
                TargetBranch: process.env.TARGTBRANCH,
                CheckOBFees: "All",
                FareRuleType: "short",
                "xsi:schemaLocation": "http://www.travelport.com/schema/air_v52_0 AirReqRsp.xsd"
            },
            "common:BillingPointOfSaleInfo": {
                $: { OriginApplication: "UAPI" }
            },
            AirItinerary,
            'common:SearchPassenger': passengers.map(p => ({
                $: {
                    Code: p?.$?.Code || "",
                    BookingTravelerRef: p?.$?.BookingTravelerRef || ""
                }
            })),
            // 'common:SearchPassenger': passenger.map(p => ({
            //     $: {

            //         Code: p.$.Code,
            //         BookingTravelerRef: p.$.BookingTravelerRef
            //     }
            // })),
            "AirPricingCommand": pricingCommand
        }
    };
    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common": "http://www.travelport.com/schema/common_v52_0"
            },
            "soapenv:Body": airPriceRequest
        }
    };
    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });

    const xmlRequest = builder.buildObject(requestSchema);

    return xmlRequest;
}

async function getFlighstRePriceRequestOld(searchData) {
    const priceId = Buffer.from(searchData.price_id, 'base64').toString('utf8');
    const flightData = await getCacheData(priceId);

    const passenger = flightData.passenger;
    const segments = flightData.segments;
    const hostToken = flightData.hostToken;
    const fareInfo = flightData.fareInfo;
    const journey = flightData.journey;

    const app_reference = "FB-251125-120408-7440";
    //const segmentKeys = journey['air:AirSegmentRef'].map(seg => seg.$.Key);
    const AirItinerary = {
        AirSegment: segments.map(seg => ({
            $: {
                Key: seg.$.Key,
                Group: seg.$.Group,
                Carrier: seg.$.Carrier,
                FlightNumber: seg.$.FlightNumber,
                Origin: seg.$.Origin,
                Destination: seg.$.Destination,
                DepartureTime: seg.$.DepartureTime,
                ArrivalTime: seg.$.ArrivalTime,
                FlightTime: seg.$.FlightTime,
                Equipment: seg.$.Equipment,
                Status: seg.$.Status,
                SupplierCode: seg.$.SupplierCode,
                ChangeOfPlane: seg.$.ChangeOfPlane,
                OptionalServicesIndicator: seg.$.OptionalServicesIndicator,
                APISRequirementsRef: seg.$.APISRequirementsRef,
                ClassOfService: "X",
                ProviderCode: "ACH",
                ParticipantLevel: "Secure Sell",
                LinkAvailability: "true",
                PolledAvailabilityOption: "Polled avail used",
                AvailabilitySource: "S",
                AvailabilityDisplayType: "Fare Shop/Optimal Shop",
                HostTokenRef: seg.$.HostTokenRef
            },

            CodeshareInfo: {
                $: {
                    OperatingCarrier: seg.$.Carrier,
                    OperatingFlightNumber: seg.$.FlightNumber
                }
            },

            AirAvailInfo: {
                $: {
                    ProviderCode: "ACH"
                }
            },

            Connection: ""
        })),
        "common_v52_0:HostToken": hostToken.map(ht => ({
            $: { Key: ht.$.Key },
            _: ht._
        }))

    };

    const pricingCommand = [
        {
            'AirSegmentPricingModifiers': {
                $: { AirSegmentRef: journey['air:AirSegmentRef'].$.Key, FareBasisCode: fareInfo.FareBasis }
            }
        }
    ];

    // Main request body
    const airPriceRequest = {
        "AirPriceReq": {
            $: {
                "xmlns": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                TraceId: app_reference,
                AuthorizedBy: "Travelport",
                TargetBranch: process.env.TARGTBRANCH,
                CheckOBFees: "All",
                FareRuleType: "short",
                "xsi:schemaLocation": "http://www.travelport.com/schema/air_v52_0 AirReqRsp.xsd"
            },
            "common:BillingPointOfSaleInfo": {
                $: { OriginApplication: "UAPI" }
            },
            AirItinerary,
            'common:SearchPassenger': passenger.map(p => ({
                $: {
                    Code: p.$.Code,
                    BookingTravelerRef: p.$.BookingTravelerRef
                }
            })),
            "AirPricingCommand": pricingCommand
        }
    };

    // Wrap in SOAP envelope
    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common": "http://www.travelport.com/schema/common_v52_0"
            },
            "soapenv:Body": airPriceRequest
        }
    };

    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });

    const xmlRequest = builder.buildObject(requestSchema);
    return xmlRequest;
}

async function generateBookingTravelersObject(passenger_detail, contact_detail, travellerData) {
    const travelers = [];
    const travelerTypes = ["ADT", "CHD", "INF"];

    travelerTypes.forEach(type => {

        if (!passenger_detail[type]) return;
        passenger_detail[type].forEach((p, idx) => {

            const refKey = `${type}_${idx}`;

            const travelerKey = travellerData[refKey];
            if (!travelerKey) {
                throw new Error(`travellerData missing key: ${refKey}`);
            }

            const travelerAttrs = {
                xmlns: "http://www.travelport.com/schema/common_v52_0",
                TravelerType: type,
                Key: travelerKey.trim(),
                Gender: p.gender || "",
                Nationality: p.nationality || ""
            };

            if (type === "CHD" || type === "INF") {
                travelerAttrs.DOB = p.dob || "";
                travelerAttrs.Age = p.age || "";
            }

            travelers.push({
                BookingTraveler: {
                    $: travelerAttrs,

                    BookingTravelerName: [{
                        $: {
                            Prefix: p.prefix?.trim(),
                            First: p.first_name?.trim(),
                            Last: p.last_name?.trim()
                        }
                    }],

                    PhoneNumber: [{
                        $: {
                            Number: contact_detail.mobile.trim(),
                            Type: "Mobile"
                        }
                    }],

                    Email: [{
                        $: {
                            EmailID: contact_detail.email.trim(),
                            Type: "P"
                        }
                    }],

                    Address: [{
                        AddressName: [(process.env.CADDRESSNAME || "").trim()],
                        Street: [(process.env.CSTREAT || "").trim()],
                        City: [(process.env.CCITY || "").trim()],
                        State: [(process.env.CSTATE || "").trim()],
                        PostalCode: [(process.env.POSTALCODE || "").trim()],
                        Country: [(process.env.COUNTRY || "").trim()]
                    }]
                }
            });
        });
    });

    return travelers;
}




async function getFlightCreateReservationRequest(app_reference, postData, airPriceResp, travellerData,RepriceReqData) {
    const toArray = val => Array.isArray(val) ? val : [val];
    const AirPricingSolution1 = airPriceResp?.['air:AirPriceResult']?.['air:AirPricingSolution']
    const AirPricingInfo = toArray(AirPricingSolution1['air:AirPricingInfo']);
    const OptionalServices = (AirPricingSolution1['air:OptionalServices']) ? toArray(AirPricingSolution1['air:OptionalServices']) : null;
    if (OptionalServices !== undefined && OptionalServices !== null) {
        const services = Array.isArray(OptionalServices) ? OptionalServices : [OptionalServices];
        services.forEach(item => {
            delete item['air:OptionalServiceRules'];
        });
    }
    if (Array.isArray(OptionalServices)) {
        OptionalServices.forEach(item => {
            if (item['air:OptionalService']) {
                item['air:OptionalService'] =
                    item['air:OptionalService'].filter(service =>
                        service.$?.ServiceStatus === 'Priced'
                    );
            }
        });
    }
    const providerCode = AirPricingInfo[0]?.['$']?.['ProviderCode'];
    const segments = toArray(airPriceResp?.['air:AirItinerary']?.['air:AirSegment']);
    const travelers = await generateBookingTravelersObject(postData.passenger_detail, postData.contact_detail, travellerData);
    
    const booking_type = postData.booking_type;
    // travelers.forEach(travelerObj => {
    //     const traveler = travelerObj.BookingTraveler;
    //     if (traveler.$.Nationality === "") {
    //         traveler.$.Nationality = "IN";
    //     }
    //     if (traveler.$.Gender === "") {
    //         traveler.$.Gender = "M";
    //     }
    //     if (traveler.$.DOB) {
    //         const [day, month, year] = traveler.$.DOB.split('-');
    //         traveler.$.DOB = `${year}-${month}-${day}`;
    //     }
    // });
    travelers.forEach(travelerObj => {
        const traveler = travelerObj.BookingTraveler;
        if (!traveler.$.Nationality) {
            traveler.$.Nationality = "IN";
        }
        if (!traveler.$.Gender) {
            traveler.$.Gender = "M";
        }
        if (traveler.$.DOB) {
            const parts = traveler.$.DOB.split(/[-/]/);
            if (parts.length === 3) {
                const [day, month, year] = parts;
                traveler.$.DOB = `${year}-${month}-${day}`;
                const dob = new Date(`${year}-${month}-${day}`);
                const today = new Date();
                let age = today.getFullYear() - dob.getFullYear();
                const monthDiff = today.getMonth() - dob.getMonth();
                if (
                    monthDiff < 0 ||
                    (monthDiff === 0 && today.getDate() < dob.getDate())
                ) {
                    age--;
                }
                traveler.$.Age = age.toString();
            }
        }
    });
    const BookingTraveler = travelers.map(t => t.BookingTraveler);
    const APRData = AirPricingSolution1;



    //const segments = airPriceResp.segments;
    // const segmentsArray = Object.values(segments).map(seg => ({
    //     $: seg.$,
    //     'air:CodeshareInfo': [seg['air:CodeshareInfo']],
    //     'air:Connection': [seg['air:Connection']]
    // }));

    const segmentsArray = Object.values(segments || {}).map((seg) => {
        const obj = {};

        if (seg?.$) {
            obj.$ = seg.$;
        }
        if (seg?.['air:CodeshareInfo']) {
            obj['air:CodeshareInfo'] = Array.isArray(seg['air:CodeshareInfo'])
                ? seg['air:CodeshareInfo']
                : [seg['air:CodeshareInfo']];
        }
        if (seg?.['air:Connection']) {
            obj['air:Connection'] = Array.isArray(seg['air:Connection'])
                ? seg['air:Connection']
                : [seg['air:Connection']];
        }

        return obj;
    });

    const airPricingInfo = APRData["air:AirPricingInfo"];
    const TaxInfos = APRData["air:TaxInfo"];
    // const airPricingSolution = {
    //     "air:AirSegment": segmentsArray,
    //     "air:AirPricingInfo": airPricingInfo,
    //     "common_v52_0:HostToken": APRData["common_v52_0:HostToken"]
    // };
    // if (providerCode === "ACH") {
    //     airPricingSolution["air:TaxInfo"] = TaxInfos;
    // }

    // const requestSchema = {
    //     "soapenv:Envelope": {
    //         $: {
    //             "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
    //             "xmlns:com": "http://www.travelport.com/schema/common_v52_0",
    //             "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
    //             "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
    //             "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0",
    //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
    //         },
    //         "soapenv:Header": {

    //         },
    //         "soapenv:Body": {
    //             "AirCreateReservationReq": {
    //                 $: {
    //                     "TraceId": app_reference,
    //                     "xmlns": "http://www.travelport.com/schema/universal_v52_0",
    //                     "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
    //                     "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0",
    //                     "RetainReservation": "None",
    //                     "TargetBranch": process.env.TARGTBRANCH,
    //                     "AuthorizedBy": "Travelport",
    //                     "ProviderCode": providerCode,
    //                     "ConnectivityCheckoverride": "Yes",
    //                     "RestrictWaitlist": "true"

    //                 },
    //                 "com:BillingPointOfSaleInfo": {
    //                     $: { "OriginApplication": "UAPI" }
    //                 },
    //                 BookingTraveler,
    //                 "com:AgencyContactInfo": {
    //                     "com:PhoneNumber": {
    //                         $: {
    //                             "Type": "Agency", "Location": "BLR", "CountryCode": "91", "Number": process.env.CCONTACT_NUMBER, "Text": process.env.CCOMPANY_NAME
    //                         }
    //                     }
    //                 },

    //                 // -------- Payment ----------
    //                 "FormOfPayment": {
    //                     $: { "Type": "Credit", xmlns: "http://www.travelport.com/schema/common_v52_0", "Key": "1" },
    //                     "CreditCard": {
    //                         $: {
    //                             "BankCountryCode": "IN",
    //                             "BankName": "VISA",
    //                             "CVV": "123",
    //                             "ExpDate": "2026-12",
    //                             "Name": "Test Travelport",
    //                             "Number": "5210000010001001",
    //                             "Type": "MC",
    //                             "Key": "1"
    //                         },
    //                         "BillingAddress": {
    //                             "AddressName": "Home",
    //                             "Street": "Richmond Road",
    //                             "City": "Bangalore",
    //                             "State": "Karnataka",
    //                             "PostalCode": "560025",
    //                             "Country": "IN"
    //                         }
    //                     }
    //                 },
    //                 //"air:AirPricingSolution": airPricingSolution,
    //                 "air:AirPricingSolution": {
    //                     "air:AirSegment": segmentsArray,
    //                     "air:AirPricingInfo": airPricingInfo,
    //                     "air:TaxInfo": TaxInfos,
    //                     "common_v52_0:HostToken": APRData["common_v52_0:HostToken"]
    //                 },
    //                 "ActionStatus": {
    //                     $: { "Type": "ACTIVE", "TicketDate": "T", "ProviderCode": providerCode, xmlns: "http://www.travelport.com/schema/common_v52_0" }
    //                 }
    //             }
    //         }
    //     }
    // };


    let airPricingSolution;
    if (providerCode === "ACH") {
        //airPricingSolution["air:TaxInfo"] = TaxInfos;
        airPricingSolution = {
            "air:AirSegment": segmentsArray,
            "air:AirPricingInfo": airPricingInfo,
            "air:TaxInfo": TaxInfos,
            "common_v52_0:HostToken": APRData["common_v52_0:HostToken"],
            "air:OptionalServices": OptionalServices
        };
    } else {
        airPricingSolution = {
            "$": APRData["$"],
            "air:AirSegment": segmentsArray,
            "air:AirPricingInfo": airPricingInfo,
            "common_v52_0:HostToken": APRData["common_v52_0:HostToken"],
            "air:OptionalServices": OptionalServices
        };
    }

    
    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:com": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
            },
            "soapenv:Header": {},
            "soapenv:Body": {
                "AirCreateReservationReq": {
                    $: {
                        "TraceId": app_reference,
                        "xmlns": "http://www.travelport.com/schema/universal_v52_0",
                        "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                        "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0",
                        "RetainReservation": "None",
                        "TargetBranch": process.env.TARGTBRANCH,
                        "AuthorizedBy": "Travelport",
                        "ProviderCode": providerCode,
                        "ConnectivityCheckoverride": "Yes",
                        "RestrictWaitlist": "true"
                    },

                    "com:BillingPointOfSaleInfo": {
                        $: { "OriginApplication": "UAPI" }
                    },

                    BookingTraveler,

                    "com:AgencyContactInfo": {
                        "com:PhoneNumber": {
                            $: {
                                "Type": "Agency",
                                "Location": "BLR",
                                "CountryCode": "91",
                                "Number": process.env.CCONTACT_NUMBER,
                                "Text": process.env.CCOMPANY_NAME
                            }
                        }
                    },
                    ...(booking_type === "confirm" && {
                        "FormOfPayment": {
                            $: {
                                "Type": "Credit",
                                xmlns: "http://www.travelport.com/schema/common_v52_0",
                                "Key": "1"
                            },
                            "CreditCard": {
                                $: {
                                    "BankCountryCode": "IN",
                                    "BankName": "VISA",
                                    "CVV": "123",
                                    "ExpDate": "2026-12",
                                    "Name": "Test Travelport",
                                    "Number": "5210000010001001",
                                    "Type": "MC",
                                    "Key": "1"
                                },
                                "BillingAddress": {
                                    "AddressName": "Home",
                                    "Street": "Richmond Road",
                                    "City": "Bangalore",
                                    "State": "Karnataka",
                                    "PostalCode": "560025",
                                    "Country": "IN"
                                }
                            }
                        }
                    }),

                    // "air:AirPricingSolution": {
                    //     "air:AirSegment": segmentsArray,
                    //     "air:AirPricingInfo": airPricingInfo,
                    //     "air:TaxInfo": TaxInfos,
                    //     "common_v52_0:HostToken": APRData["common_v52_0:HostToken"]
                    // },
                    "air:AirPricingSolution": airPricingSolution,
                    "ActionStatus": {
                        $: {
                            "Type": "ACTIVE",
                            "TicketDate": "T",
                            "ProviderCode": providerCode,
                            xmlns: "http://www.travelport.com/schema/common_v52_0"
                        }
                    }
                }
            }
        }
    };
    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });
    const xmlRequest = builder.buildObject(requestSchema);
    //console.log('requestSchema',xmlRequest);return false; 
    return xmlRequest;
}

async function RetriveReservation(searchData) {

    const pro_code = searchData?.[0]?.pro_code;
    const pro_locator_code = searchData?.[0]?.pro_locator_code;
    const supp_code = searchData?.[0]?.supp_code;
    const app_reference = searchData?.[0]?.app_reference;


    const AirCreateReservationReq = {

        "air:AirSegment": {
            $: {
                Key: "WX/qDqSqWDKAPwTHLAAAAA==",
                Group: "0",
                Carrier: "6E",
                FlightNumber: "5136",
                ProviderCode: "ACH",
                Origin: "JAI",
                Destination: "DEL",
                DepartureTime: "2025-11-29T23:45:00.000+05:30",
                ArrivalTime: "2025-11-30T00:50:00.000+05:30",
                FlightTime: "65",
                TravelTime: "65",
                ClassOfService: "X",
                Equipment: "321",
                Status: "KK",
                ChangeOfPlane: "false",
                HostTokenRef: "WX/qDqSqWDKAQwTHLAAAAA==",
                SupplierCode: "6E",
                OptionalServicesIndicator: "true",
                APISRequirementsRef: "WX/qDqSqWDKARwTHLAAAAA=="
            },

            "air:Connection": ""
        },



        "common_v52_0:HostToken": {
            $: { Key: "WX/qDqSqWDKAQwTHLAAAAA==" },
            _: "NNS6E{IS###}INR{CC###ET}ACHSDv01LPD1:8ff91378-dcb4-4093-b947-39e6205fe7a0"
        }
    };




    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:com": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
            },

            // -------------------------------
            // SOAP BODY
            // -------------------------------
            "soapenv:Body": {
                "AirCreateReservationReq": {
                    $: {
                        "TraceId": "FB-261125-185745-5981",
                        "xmlns": "http://www.travelport.com/schema/universal_v52_0",
                        "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                        "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0",
                        "RetainReservation": "None",
                        "TargetBranch": "P7222838",
                        "AuthorizedBy": "Travelport",
                        "ProviderCode": "ACH",
                        "ConnectivityCheckoverride": "Yes",
                        "RestrictWaitlist": "true"
                    },

                    // ========================================
                    //   INSERT YOUR FULL PRICING OBJECT HERE
                    // ========================================
                    "air:AirPricingSolution":
                        AirCreateReservationReq,

                }
            }
        }
    };
    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });

    const xmlRequest = builder.buildObject(requestSchema);
    return xmlRequest;
}
async function RetrieveReservationRequest(app_reference, record_locator, provider_code, supplier_code) {

    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/"
            },
            "soapenv:Body": {
                "univ:UniversalRecordRetrieveReq": {
                    $: {
                        "TargetBranch": "P7222838",
                        "AuthorizedBy": "Travelport",
                        "TraceId": "456790",
                        "xmlns:univ": "http://www.travelport.com/schema/universal_v52_0",
                        "xmlns:com": "http://www.travelport.com/schema/common_v52_0"
                    },

                    "com:BillingPointOfSaleInfo": {
                        $: {
                            "OriginApplication": "UAPI"
                        }
                    },

                    "univ:ProviderReservationInfo": {
                        $: {
                            "ProviderCode": provider_code,
                            "ProviderLocatorCode": record_locator,
                            "SupplierCode": supplier_code
                        }
                    }
                }
            }
        }
    };

    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });

    const xmlRequest = builder.buildObject(requestSchema);
    return xmlRequest;
}

async function getFlighstOptionalServicesRequest(postData, AirSegmentListArr, HostTokenListArr, app_reference, providerCode) {
    const toArray = (v) => Array.isArray(v) ? v : [v];
    const airSegmentArr = Object.values(AirSegmentListArr).map(item => item.$);

    const hostToken = Object.values(HostTokenListArr);
    const hostTokensXML = (hostToken || [])
        .filter(ht => ht?._ && ht?.$?.Key)
        .map(ht => ({
            $: { Key: ht.$.Key },
            _: ht._,
            "xmlns:com": "http://www.travelport.com/schema/common_v52_0"
        }));


    // if (providerCode === "ACH") {
    //             segment.$.Status = attr.Status || "";
    //             segment.$.SupplierCode = attr.SupplierCode || "";
    //             segment.$.ChangeOfPlane = attr.ChangeOfPlane || "";
    //             segment.$.OptionalServicesIndicator = attr.OptionalServicesIndicator || "";
    //             segment.$.APISRequirementsRef = attr.APISRequirementsRef || "";
    //             segment.$.ParticipantLevel = "Secure Sell";
    //             segment.$.LinkAvailability = "true";
    //             segment.$.PolledAvailabilityOption = "Polled avail used";
    //             segment.$.AvailabilitySource = "S";
    //             segment.$.AvailabilityDisplayType = "Fare Shop/Optimal Shop";

    //             // if (attr.HostTokenRef) {
    //             //     segment.$.HostTokenRef = attr.HostTokenRef;
    //             // }

    //             for (const ht of pIdHostToken) {
    //                 if (attr.Key === ht.seg) {
    //                     segment.$.HostTokenRef = ht?.$?.Key;
    //                 }
    //             }
    //         }
    //         const finalSegment = {
    //             ...segment,
    //         };

    const AirSegment = (airSegmentArr || []).map(seg => {
        const attr = seg || {};
        const bookingClass = attr.ClassOfService || attr.BookingCode || seg.BookingCode || "";
        if (!bookingClass && providerCode === "1G") {
            throw new Error("Missing ClassOfService for 1G segment, cannot proceed");
        }
        const segment = {
            $: attr,
            "air:CodeshareInfo": {
                $: {
                    OperatingCarrier: attr.Carrier || "",
                    OperatingFlightNumber: attr.FlightNumber || ""
                }
            },
            "air:Connection": ""
        };
        return segment;
    });
    const passengers = Object.entries(postData.pax).flatMap(([code, arr]) =>
        arr.map(person => ({
            ...person, code, ref: "QURUXz" + (
                Math.random().toString(36).substring(2) +
                Math.random().toString(36).substring(2)
            ).substring(0, 18)
        }))
    );
    const SeatMapReq = {
        "SeatMapReq": {
            $: {
                "xmlns": "http://www.travelport.com/schema/air_v52_0",
                TraceId: app_reference,
                AuthorizedBy: "Travelport",
                TargetBranch: process.env.TARGTBRANCH,
                ReturnSeatPricing: "true",
                ReturnBrandingInfo: "true"
            },
            "BillingPointOfSaleInfo": {
                $: { xmlns: "http://www.travelport.com/schema/common_v52_0", OriginApplication: "UAPI" }
            },
            AirSegment,
            "com:HostToken": (hostTokensXML || [])
                .filter(ht => ht?.$?.Key && ht?._)
                .map(ht => ({
                    $: { Key: ht.$.Key },
                    _: ht._
                })),
            'SearchTraveler': passengers.map(p => ({
                $: {
                    Code: p?.code || "",
                    Key: p?.ref || ""
                },
                "Name": {
                    $: { xmlns: "http://www.travelport.com/schema/common_v52_0", Prefix: p?.prefix, First: p?.first_name, Last: p?.last_name }
                },
            }))
        }
    };

    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:ses": "http://www.travelport.com/soa/common/security/SessionContext_v1",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                "xmlns:com": "http://www.travelport.com/schema/common_v52_0"
            },
            "soapenv:Body": SeatMapReq
        }
    };
    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });
    const xmlRequest = builder.buildObject(requestSchema);
    return xmlRequest;
}

async function TicketingRequest(app_reference, record_locator, air_pricing_keys = []) {
    const airPricingRefs = air_pricing_keys.map(key => ({
        $: { Key: key }
    }));
    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/"
            },
            "soapenv:Body": {
                "AirTicketingReq": {
                    $: {
                        "AuthorizedBy": "Travelport",
                        "TargetBranch": app_reference,
                        "xmlns": "http://www.travelport.com/schema/air_v52_0"
                    },
                    "BillingPointOfSaleInfo": {
                        $: {
                            "xmlns": "http://www.travelport.com/schema/common_v52_0",
                            "OriginApplication": "UAPI"
                        }
                    },
                    "AirReservationLocatorCode": record_locator,
                    "AirPricingInfoRef": airPricingRefs
                }
            }
        }
    };

    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });

    return builder.buildObject(requestSchema);
}

async function HoldToConfirmRequest(
  app_reference,
  universallocatorCode,
  provider_locator_code,
  provider_code,
  resLocatorCode,
  airPriceRef,
  api_final_fare,
  version
) {
  const airPriceKeys = Array.isArray(airPriceRef)
    ? airPriceRef
    : [airPriceRef];

  const airPriceRefArray = airPriceKeys.map((key) => ({
    $: { Key: key }
  }));
  const requestSchema = {
    "soapenv:Envelope": {
      $: {
        "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
        "xmlns:univ": "http://www.travelport.com/schema/universal_v52_0",
        "xmlns:com": "http://www.travelport.com/schema/common_v52_0",
        "xmlns:air": "http://www.travelport.com/schema/air_v52_0"
      },
      "soapenv:Body": {
        "univ:UniversalRecordModifyReq": {
          $: {
            TargetBranch: "P7222838",
            AuthorizedBy: "Travelport",
            TraceId: app_reference,
            ReturnRecord: "true",
            Version: version
          },

          "com:BillingPointOfSaleInfo": {
            $: {
              OriginApplication: "UAPI"
            }
          },

          "univ:RecordIdentifier": {
            $: {
              UniversalLocatorCode: universallocatorCode,
              ProviderCode: provider_code,
              ProviderLocatorCode: provider_locator_code
            }
          },

          "univ:UniversalModifyCmd": {
            $: {
              Key: "PDwegefffefdeB/wYIhwmw==" // ⚠️ dynamic hona chahiye ideally
            },

            "univ:AirAdd": {
              $: {
                ReservationLocatorCode: resLocatorCode
              },

              "air:AirPricingPayment": {
                "com:Payment": {
                  $: {
                    Key: "02",
                    Amount: `INR${api_final_fare}`,
                    FormOfPaymentRef: "1", // ✅ FIXED (match with FOP key)
                    Type: "Passenger"
                  }
                },

                "com:FormOfPayment": {
                  $: {
                    Type: "Credit",
                    Key: "1"
                  },

                  "com:CreditCard": {
                    $: {
                      BankCountryCode: "IN",
                      BankName: "VISA",
                      CVV: "123",
                      ExpDate: "2026-12",
                      Name: "Test Travelport",
                      Number: "5210000010001001",
                      Type: "MC",
                      Key: "1"
                    },

                    "com:BillingAddress": {
                      "com:AddressName": "Home",
                      "com:Street": "Richmond Road",
                      "com:City": "Bangalore",
                      "com:State": "Karnataka",
                      "com:PostalCode": "560025",
                      "com:Country": "IN"
                    }
                  }
                },

                "air:AirPricingInfoRef": airPriceRefArray
              }
            }
          }
        }
      }
    }
  };

  const builder = new xml2js.Builder({
    headless: true,
    renderOpts: { pretty: true }
  });

  const xmlRequest = builder.buildObject(requestSchema);
  return xmlRequest;
}
async function HoldToConfirmRequest1(app_reference, universallocatorCode, provider_locator_code, provider_code, resLocatorCode, airPriceRef, api_final_fare, version) {
    
    const airPriceRefArray = airPriceRef.map(key => ({
        $: { Key: key }
    }));
    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:univ": "http://www.travelport.com/schema/universal_v52_0",
                "xmlns:com": "http://www.travelport.com/schema/common_v52_0",
                "xmlns:air": "http://www.travelport.com/schema/air_v52_0"
            },
            "soapenv:Body": {
                "univ:UniversalRecordModifyReq": {
                    $: {
                        TargetBranch: "P7222838",
                        AuthorizedBy: "Travelport",
                        TraceId: app_reference,
                        ReturnRecord: "true",
                        Version: version
                    },

                    "com:BillingPointOfSaleInfo": {
                        $: {
                            OriginApplication: "UAPI"
                        }
                    },

                    "univ:RecordIdentifier": {
                        $: {
                            UniversalLocatorCode: universallocatorCode,
                            ProviderCode: provider_code,
                            ProviderLocatorCode: provider_locator_code
                        }
                    },

                    "univ:UniversalModifyCmd": {
                        $: {
                            Key: "PDwegefffefdeB/wYIhwmw=="
                        },

                        "univ:AirAdd": {
                            $: {
                                ReservationLocatorCode: resLocatorCode
                            },

                            "air:AirPricingPayment": {
                                "com:Payment": {
                                    $: {
                                        Key: "02",
                                        Amount: `INR${api_final_fare}`,
                                        FormOfPaymentRef: "01",
                                        Type: "Passenger"
                                    }
                                },

                                "com:FormOfPayment": {
                                    $: {
                                        Type: "Credit",
                                        Key: "1"
                                    },

                                    "com:CreditCard": {
                                        $: {
                                            BankCountryCode: "IN",
                                            BankName: "VISA",
                                            CVV: "123",
                                            ExpDate: "2026-12",
                                            Name: "Test Travelport",
                                            Number: "5210000010001001",
                                            Type: "MC",
                                            Key: "1"
                                        },

                                        "com:BillingAddress": {
                                            "com:AddressName": "Home",
                                            "com:Street": "Richmond Road",
                                            "com:City": "Bangalore",
                                            "com:State": "Karnataka",
                                            "com:PostalCode": "560025",
                                            "com:Country": "IN"
                                        }
                                    }
                                },

                                "air:AirPricingInfoRef": airPriceRefArray
                            }
                        }
                    }
                }
            }
        }
    };

    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: { pretty: true }
    });

    const xmlRequest = builder.buildObject(requestSchema);
    return xmlRequest;
}

async function RefundQuoteRequest(app_reference,paxsName,additionalData,itinaryCheckArry,segmentOrDesArr) {

    const {
        tcr_num: tcrNum
    } = additionalData;

    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/"
            },

            "soapenv:Header": {},

            "soapenv:Body": {
                "air:AirRefundQuoteReq": {
                    $: {
                        TraceId: app_reference,
                        AuthorizedBy: "Travelport",
                        TargetBranch: "P7222838",
                        "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                        "xmlns:com": "http://www.travelport.com/schema/common_v52_0"
                    },

                    "com:BillingPointOfSaleInfo": {
                        $: {
                            OriginApplication: "UAPI"
                        }
                    },

                    "air:TCRNumber": tcrNum
                }
            }
        }
    };

    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: {
            pretty: true
        }
    });
    return builder.buildObject(requestSchema);
}


async function flightRefundRequest(app_reference, data) {
    const tcrRefundBundle = data;
    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/"
            },
            "soapenv:Header": {},
            "soapenv:Body": {
                "air:AirRefundReq": {
                    $: {
                        TraceId: app_reference,
                        AuthorizedBy: "Travelport",
                        TargetBranch: "P7222838",
                        "xmlns:air": "http://www.travelport.com/schema/air_v52_0",
                        "xmlns:com": "http://www.travelport.com/schema/common_v52_0",
                        "xmlns:common_v52_0": "http://www.travelport.com/schema/common_v52_0"
                    },
                    "com:BillingPointOfSaleInfo": {
                        $: {
                            OriginApplication: "UAPI"
                        }
                    },
                    "air:TCRRefundBundle": {
                        $: {
                            TCRNumber: tcrRefundBundle.$.TCRNumber,
                            RefundType: tcrRefundBundle.$.RefundType
                        },
                        "air:AirRefundInfo": tcrRefundBundle["air:AirRefundInfo"],
                        "air:AirSegment": tcrRefundBundle["air:AirSegment"],
                        "common_v52_0:HostToken": tcrRefundBundle["common_v52_0:HostToken"]
                    }
                }
            }
        }
    };
    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: {
            pretty: true
        }
    });
    const xmlRequest = builder.buildObject(requestSchema);
    return xmlRequest;
}
async function cancelFlightTicketUR(uniLocCode, app_reference, version) {

    const requestSchema = {
        "soapenv:Envelope": {
            $: {
                "xmlns:soapenv": "http://schemas.xmlsoap.org/soap/envelope/",
                "xmlns:univ": "http://www.travelport.com/schema/universal_v50_0",
                "xmlns:com": "http://www.travelport.com/schema/common_v50_0"
            },

            "soapenv:Header": {
                "univ:SupportedVersions": {}
            },

            "soapenv:Body": {
                "univ:UniversalRecordCancelReq": {
                    $: {
                        TraceId: app_reference,
                        TargetBranch: "P7222838",
                        AuthorizedBy: "Travelport",
                        UniversalRecordLocatorCode: uniLocCode,
                        Version: version
                    },

                    "com:BillingPointOfSaleInfo": {
                        $: {
                            OriginApplication: "UAPI"
                        }
                    }
                }
            }
        }
    };

    const builder = new xml2js.Builder({
        headless: true,
        renderOpts: {
            pretty: true
        }
    });

    return builder.buildObject(requestSchema);
}

module.exports = {
    getFlighstSearchRequest, getFlighstSearchRequest_GDSACC, getFlighstSearchRequest_Premium, getFlighstSearchRequest_Business, getFlighstAirPriceRequest, getFlighstRePriceRequest, getFlightCreateReservationRequest, RetrieveReservationRequest,
    getFlighstOptionalServicesRequest, TicketingRequest, HoldToConfirmRequest,RefundQuoteRequest,flightRefundRequest,cancelFlightTicketUR
}
