const RideService = require('../services/ride.service');
const CustomMessages = require("../../utilities/customMessages");
let dbPool = require('../../database/db');
const RideModel = require('../models/ride.model');
const CustomModel = require('../../models/CustomDbModel');
const batch = require('../../database/GroupUpdateInsert');
const { setCacheData, getCacheData } = require("../../../shared/redis/Redis");

class RideController {
    async GetAirports(req, res) {
        let status = FAILURE_STATUS;
        let message = CustomMessages.DataNotFound();
        let errors = null;

        const { term, type } = req.query;

        let aprtListKey = 'all_airport_list_raw';
        let airportCacheList = await getCacheData(aprtListKey);
        if(!airportCacheList){
            let getFlightRawList = await RideModel.get_raw_airport_list();
            await setCacheData(aprtListKey, getFlightRawList);
        }

        let airlineListKey = 'all_airline_list_raw';
        let airlineCacheList = await getCacheData(airlineListKey);
        if(!airlineCacheList){
            let getAirlineRawList = await RideModel.get_raw_airline_list();
            await setCacheData(airlineListKey, getAirlineRawList);
        }
        let CacheKey =
            FLIGHT_BOOKING +
            DB_SAFE_SEPARATOR +
            (term ?? "") +
            DB_SAFE_SEPARATOR;

        let CacheDataGet = await getCacheData(CacheKey);

        // ✔ Cache hit but only if array has data
        if (CacheDataGet && Array.isArray(CacheDataGet) && CacheDataGet.length > 0) {
            return res.send({
                status: SUCCESS_STATUS,
                message: CustomMessages.successResponse(),
                data: CacheDataGet,
                //errors: null,
            });
        }

        //  Cache empty → fetch from DB
        try {
            CacheDataGet = await RideModel.get_airport_list(term);

            // If DB gives empty array → No Data Found
            if (!CacheDataGet || CacheDataGet.length === 0) {
                return res.send({
                    status: FAILURE_STATUS,
                    message: "Airport not found!",//CustomMessages.DataNotFound(),
                    // data: [],
                    //errors: null,
                });
            }

            // ✔ Save only if data exists
            await setCacheData(CacheKey, CacheDataGet, 604800);

            return res.send({
                status: SUCCESS_STATUS,
                message: CustomMessages.successResponse(),
                data: CacheDataGet,
            });

        } catch (error) {
            res.write(`data: ${JSON.stringify({
                status: FAILURE_STATUS,
                message: CustomMessages.somethingWrong(),
                data: [],
                errors: error?.message || error
            })}\n\n`);
            res.end();
        }

    }
    async GetCountries(req, res) {
        const { type, search = '', state_id = null } = req.query;

        // =========================
        // Validation
        // =========================
        if (!type) {
            return res.send({
                status: FAILURE_STATUS,
                message: 'type is required (country/state/city)',
                data: []
            });
        }

        // =========================
        // Cache Key
        // =========================
        const CacheData =
            FLIGHT_BOOKING +
            DB_SAFE_SEPARATOR +
            'LOCATION_LIST' +
            DB_SAFE_SEPARATOR +
            type +
            DB_SAFE_SEPARATOR +
            (state_id ?? 'ALL') +
            DB_SAFE_SEPARATOR +
            (search ?? '');

        try {
            const cacheData = await getCacheData(CacheData);

            if (Array.isArray(cacheData) && cacheData.length > 0) {
                return res.send({
                    status: SUCCESS_STATUS,
                    message: CustomMessages.successResponse(),
                    data: cacheData
                });
            }

            // =========================
            // DB Call
            // =========================
            const resData = await RideModel.get_location_list(
                type,
                search,
                state_id
            );

            if (!Array.isArray(resData) || resData.length === 0) {
                return res.send({
                    status: FAILURE_STATUS,
                    message: CustomMessages.DataNotFound(),
                    data: []
                });
            }

            // =========================
            // Save Cache
            // =========================
            await setCacheData(CacheData, resData, 604800);

            return res.send({
                status: SUCCESS_STATUS,
                message: CustomMessages.successResponse(),
                resData
            });

        } catch (error) {
            return res.send({
                status: FAILURE_STATUS,
                message: CustomMessages.somethingWrong(),
                data: [],
                errors: error?.message || error
            });
        }
    }

    async GetFlightListStream(req, res) {

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        RideService.GetFlightListStream(
            "Travelport",
            req.body,
            (chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`), // push
            () => res.end() // done
        );
    }
    async GetFlightList(req, res) {
        const searchData = req.body;
        try {
            searchData.user_id = req.user?.user_id || 0;
            const flights = await RideService.GetFlightList('Travelport', searchData);
            res.send(flights);

        } catch (err) {
            console.error("Error in GetFlightList:", err);
            res.write(`data: ${JSON.stringify({
                status: 0,
                message: err.message || "Something went wrong",
                data: []
            })}\n\n`);
            res.end();
        }
    }
    async GetFlightListController(req, res) {
        const searchData = req.body;

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const cumulativeResults = [];

        // Initial message
        //res.write(`data: ${JSON.stringify({ status: 1, message: "Flight search started...", data: [] })}\n\n`);

        try {
            await RideService.GetFlightListWithSSE('Travelport', searchData, (providerData) => {
                // Update cumulativeResults with new flights
                cumulativeResults.length = 0; // clear previous
                cumulativeResults.push(...providerData.cumulativeData);

                res.write(`data: ${JSON.stringify({ status: 1, message: "Success", data: cumulativeResults })}\n\n`);
            });

            // All done
            res.write(`data: ${JSON.stringify({ status: 1, message: "Flight List", data: cumulativeResults })}\n\n`);
            res.end();

        } catch (err) {
            res.write(`data: ${JSON.stringify({ status: 0, message: err.message, data: [] })}\n\n`);
            res.end();
        }
    }


    async GetFareRules(req, res) {
        let status = FAILURE_STATUS;
        let message = CustomMessages.DataNotFound();
        let errors = null;

        const { fare_type } = req.query;


        // Cache Key: FLIGHT_BOOKING:fare_rules:<fare_type>
        let CacheKey = `${FLIGHT_BOOKING}${DB_SAFE_SEPARATOR}fare_rules${DB_SAFE_SEPARATOR}${fare_type}`;
        let CacheDataGet = await getCacheData(CacheKey);

        if (CacheDataGet) {
            status = SUCCESS_STATUS;
            message = CustomMessages.successResponse();
        } else {
            try {

                // API/DB से fare rule fetch करो
                CacheDataGet = await RideModel.get_fare_rule(fare_type);

                // 7 days cache
                await setCacheData(CacheKey, CacheDataGet, 604800);

                status = SUCCESS_STATUS;
                message = CustomMessages.successResponse();
            } catch (error) {
                message = CustomMessages.somethingWrong();
                errors = error;
            }
        }

        return res.send({
            status,
            message,
            data: CacheDataGet,
            errors
        });
    }

    async GetDetail(req, res) {
        const searchData = req.body;
        searchData.user_id = req.user?.user_id || null;
        try {
            const flights = await RideService.airPrice('Travelport', searchData);
            res.send(flights);
        } catch (err) {
            res.write(`data: ${JSON.stringify({
                status: 0,
                message: err.message,
                data: [],
            })}\n\n`);
            res.end();
        }

    }
    async ReBooking(req, res) {
        const searchData = req.body;
        try {
            const flights = await RideService.ReBooking('Travelport', searchData);
            res.send(flights);
        } catch (err) {
            res.write(`data: ${JSON.stringify({
                status: 0,
                message: err.message || 'Internal Server Error',
                data: []
            })}\n\n`);
            res.end();
        }
    }
    
    async GetOptionalServices(req, res) {
        const searchData = req.body;
        searchData.user_id = req.user?.user_id || null;
        try {
            const flights = await RideService.GetOptionalServices('Travelport', searchData);
            res.send(flights);
        } catch (err) {
            res.write(`data: ${JSON.stringify({
                status: 0,
                message: err.message || 'Internal Server Error',
                data: []
            })}\n\n`);
            res.end();
        }
    }
    async CreateReservation(req, res) {
        const postData = req.body;
        postData.user_id = req.user?.user_id || null;
        try {
            const flights = await RideService.CreateReservation('Travelport', postData);
            res.send(flights);

        } catch (err) {
            res.write(`data: ${JSON.stringify({
                status: 0,
                message: err.message || 'Internal Server Error',
                data: []
            })}\n\n`);
            res.end();
        }

    }
    async HoldToConfirm(req, res) {
        const postData = req.body;
        postData.user_id = req.user?.user_id || null;
        try {
            const flights = await RideService.HoldToConfirm('Travelport', postData);
            res.send(flights);

        } catch (err) {
            res.write(`data: ${JSON.stringify({
                status: 0,
                message: err.message || 'Internal Server Error',
                data: []
            })}\n\n`);
            res.end();
        }

    }
    async GetHoldBookingDetail(req, res) {
        const postData = req.body;
        postData.user_id = req.user?.user_id || null;
        try {
            const flights = await RideService.GetHoldBookingDetail('Travelport', postData);
            res.send(flights);

        } catch (err) {
            res.write(`data: ${JSON.stringify({
                status: 0,
                message: err.message || 'Internal Server Error',
                data: []
            })}\n\n`);
            res.end();
        }

    }
    async unprocessTicket(req, res) {
        const postData = req.body;
        postData.user_id = req.user?.user_id || null;
        try {
            const flights = await RideService.unprocessTicket('Travelport', postData);
            res.send(flights);

        } catch (err) {
            res.write(`data: ${JSON.stringify({
                status: 0,
                message: err.message || 'Internal Server Error',
                data: []
            })}\n\n`);
            res.end();
        }

    }

    async RetriveReservation(req, res) {
        let status = FAILURE_STATUS;
        let message = CustomMessages.DataNotFound();
        let errors = null;

        try {
            const appRef = req.body.app_reference;

            if (!appRef) {
                return res.send({
                    status: FAILURE_STATUS,
                    message: "app_reference is required",
                    errors: null
                });
            }

            // DB Call
            const DataGet = await RideModel.get_RetriveData(appRef);

            if (DataGet && DataGet.result.length > 0) {
                status = SUCCESS_STATUS;
                message = CustomMessages.successResponse();
            }
            const resultData = await RideService.RetriveReservation('Travelport', DataGet.result);
            res.send(resultData);

        } catch (error) {
            console.error("Error in RetriveReservation:", error.message);

            return res.send({
                status: FAILURE_STATUS,
                message: CustomMessages.somethingWrong(),
                data: [],
                errors: error.message
            });
        }
    }

    async book(req, res) {
        const { provider, bookingData } = req.body;
        // try {
        //     const result = await RideService.book(provider, bookingData);
        //     res.json({ success: true, data: result });
        // } catch (err) {
        //     res.status(500).json({ success: false, message: err.message });
        // }
    }


    //mytest**********************************************************
    async getById(req, res) {
        try {
            const { id } = req.body;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: "ID is required"
                });
            }

            const flight = await RideService.getFlightById(id);

            if (!flight) {
                return res.status(404).json({
                    success: false,
                    message: "Data not found"
                });
            }

            res.json({ success: true, data: flight });

        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
    async getAll(req, res) {
        try {
            const flights = await RideService.getAllFlights();
            res.json({ success: true, data: flights });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    async rePrice(req, res) {
        const searchData = req.body;
        searchData.user_id = req.user?.user_id || null;
        try {
            const flights = await RideService.rePrice('Travelport', searchData);
            res.send(flights);
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }

    async GetFlightBookingReport(req, res) {
        let params = req.query;
        let connection;
        const agentId = req.user.user_id;
        if (!agentId) {
            return res.status(400).json({
                status: 0,
                message: "agent_id is required in request body",
                errors: ["agent_id is required"]
            });
        }
        try {
            connection = await dbPool.getConnection();
            const reportData = await RideModel.GetFlightBookingData(connection, agentId, params);
            if (reportData && reportData.status) {
                return res.status(200).json({
                    status: 1,
                    message: "Flight Booking Report Fetched Successfully",
                    data: reportData.data
                });
            } else {
                return res.status(200).json({
                    status: 0,
                    message: reportData.message || "Flight Booking Report Not Found",
                    data: reportData.data || []
                });
            }

        } catch (error) {
            return res.status(error.statusCode || 500).json({
                status: 0,
                message: error.message || CustomMessages.serverMsg(),
                details: error
            });
        }
        finally {
            if (connection) { connection.release(); }
        }
    }

    async CancelFlightBookingView(req, res) {
        let connection;
        try {
            connection = await dbPool.getConnection();
            let getCancelData = await RideModel.GetCancelViewDetails(req?.query?.app_reference);
            if (!getCancelData || getCancelData.status != 1) {
                let err = new Error(getCancelData.msg || 'Data Not Found!');
                err.statusCode = '500';
                throw err;
            }
            return res.status(200).json({
                status: 1,
                message: "Fetch Successful!",
                data: getCancelData.data
            });
        } catch (error) {
            console.error("Cancel Flight Booking View Error:", error);
            return res.send({
                status: 0,
                message: error.message || CustomMessages.somethingWrong(),
                errors: error
            });
        } finally {
            if (connection) connection.release();
        }
    }
    
    async cancelFlightBooking(req, res) {
        let connection;
        try {
            const postData = req.body;
            postData.user_id = req.user?.user_id || null;
            let app_reference = postData.app_reference;
            if (!app_reference) {
                return res.status(400).json({
                    status: 0,
                    message: "app_reference is required in request body",
                    errors: ["app_reference is required"]
                });
            }
            connection = await dbPool.getConnection();
            const provider = postData.provider || 'Travelport';
            const result = await RideService.cancelFlightBooking(connection, provider, postData);
            return res.status(result.statusCode || 200).json({
                status: result.status,
                message: result.message,
                data: result.data || null,
                amendment_id: result.amendment_id || null,
                errors: result.errors || null
            });

        } catch (error) {
            console.error('Error in cancelFlightBooking controller:', error);
            return res.status(error.statusCode || 500).json({
                status: 0,
                message: error.message || CustomMessages.serverMsg(),
                errors: error.errors || [error.message]
            });
        }
    }
    async FinalCancelFlightBooking(req, res) {
        let connection;
        try {
            const postData = req.body;
            postData.user_id = req.user?.user_id || null;
            const user_id = req.user?.user_id || null;
            let userData = await RideModel.get_user_detail(user_id);
            const reporting_to_id = userData.reporting_to_id;
            let app_reference = postData.app_reference;
            if (!app_reference) {
                return res.status(400).json({
                    status: 0,
                    message: "app_reference is required in request body",
                    errors: ["app_reference is required"]
                });
            }
            connection = await dbPool.getConnection();
            const provider = postData.provider || 'Travelport';

            const condition = `app_reference='${app_reference}'`;
            const cancelDetail = await RideModel.selectData('flight_booking_cancellation_details',condition,'*');
            if (!cancelDetail || !cancelDetail.result || cancelDetail.result.length === 0){
                throw {
                    status: 0,
                    message: 'Booking Detail Not Found!.Api Error.',
                    error: 'Booking Detail Not Found!.Api Error.'
                };
            }
            const cancelData = cancelDetail.result[0];
            const total_refund_amount = cancelData.refund_amount_by_admin;

            const getRefundQuoteArr = await RideService.FinalCancelFlightBooking(connection, provider, postData);
            if (getRefundQuoteArr && getRefundQuoteArr.status) {
                let refund_status = '0';
                let cancelStatus = getRefundQuoteArr.data.api_refund_status;
                if (String(cancelStatus).toUpperCase() === 'SUCCESS') {
                    refund_status = '1';
                    cancelStatus = String(cancelStatus).toUpperCase();
                }
                const updateCancelData = {
                    refund_status: refund_status,
                    status: cancelStatus,
                    updated_at: new Date()
                };
                const fbC = `app_reference='${app_reference}'`;
                const fbdDetail = await RideModel.selectData( 'flight_booking_details',fbC,'*');
                const booking_detail = fbdDetail.result[0];
                // Dist DI
                let dist_balance = await RideModel.getDistributorBalance(reporting_to_id);
                // const condition = `app_reference='${app_reference}' AND transaction_type='user_di'`;
                // const transactionLogs = await RideModel.selectData( 'transaction_log',condition,'*');
                // const disDIStatus = await RideModel.checkDistDiStatus( reporting_to_id);
                //const getTransLogDI = transactionLogs?.result[0] || {};
                if (booking_detail?.dist_segment_incentive && parseFloat(booking_detail.dist_segment_incentive) > 0) {
                    const getDistDi = parseFloat(booking_detail.dist_segment_incentive);
                    const distClosingDIBalance =
                        parseFloat(dist_balance) - getDistDi;
                    let slgD = 'Debit';
                    if (getDistDi < 0) {
                        slgD = 'Credit';
                    }
                    const distLogs_DI = {
                        system_transaction_id: await RideModel.generateAppTransactionReference(),
                        transaction_type: 'flight',
                        opening_balance: parseFloat(dist_balance),
                        closing_balance: parseFloat(distClosingDIBalance),
                        app_reference: app_reference,
                        fare: -getDistDi,
                        remarks: `Flight Booking DI ${slgD}`,
                        transaction_owner_id: this.entity_reporting_to_id,
                        created_by_id: this.entity_user_id,
                        created_datetime: new Date(),
                        currency: currency || 'INR',
                        currency_conversion_rate: currency_conversion_rate
                    };
                    if (distLogs_DI) {
                        // Deduct amount from wallet
                        const rr = await RideModel.modifyUserBalance("dist",reporting_to_id,-getDistDi);
                        // Save transaction log
                        await RideModel.insertData('transaction_log',distLogs_DI);
                    }
                }
                // Dist DI

                // Dist Markup 
                let distBalanceN = await RideModel.getDistributorBalance(reporting_to_id);
                if (booking_detail?.dist_markup) {
                    const distMarkupVal = parseFloat(booking_detail.dist_markup);
                    const distClosingDIBalance =
                        parseFloat(distBalanceN) - distMarkupVal;
                    let slgM = 'Debit';
                    if (distMarkupVal < 0) {
                        slgM = 'Credit';
                    }
                    const distLogs_Markup = {
                        system_transaction_id: await RideModel.generateAppTransactionReference(),
                        transaction_type: 'flight',
                        opening_balance: parseFloat(distBalanceN),
                        closing_balance: parseFloat(distClosingDIBalance),
                        app_reference: app_reference,
                        fare: -distMarkupVal,
                        remarks: `Flight Booking Dist Markup ${slgM}`,
                        transaction_owner_id: reporting_to_id,
                        created_by_id: user_id,
                        created_datetime: new Date(),
                        currency: 'INR',
                        currency_conversion_rate: 1
                    };
                    if (distLogs_Markup) {
                        // Deduct amount from wallet
                        await RideModel.modifyUserBalance("dist",reporting_to_id,-distMarkupVal);
                        // Save transaction log
                        await RideModel.insertData('transaction_log',distLogs_Markup);
                    
                    }
                }
                // Dist Markup 
                const FBTDcondition = `app_reference='${app_reference}'`;
                const one = await RideModel.updateData("flight_booking_cancellation_details", updateCancelData, FBTDcondition);
                const one1 = await RideModel.modifyUserBalance("b2b",user_id,total_refund_amount);
                const one2 = await RideModel.updateTransactionPaymentStatus('flight',app_reference,"paid",total_refund_amount);
                //await RideModel.saveTransactionDetails('flight_cancel', app_reference, total_refund_amount, 0, 0, 'Flight Refund', user_id, false, 'INR', 1);
                
                return res.send({
                    status: SUCCESS_STATUS,
                    message: getRefundQuoteArr.message,
                });
            }else{
                return res.status(error.statusCode || 500).json({
                    status: FAILURE_STATUS,
                    message: 'Server Issue Booking not Cancelled. Pleasetry again.',
                });
            }
        } catch (error) {
            return res.status(error.statusCode || 500).json({
                status: 0,
                message: error.message || CustomMessages.serverMsg(),
                errors: error.errors || [error.message]
            });
        }
    }
    
    async bookingRefund(req, res) {
        let connection;
        try {
            let refundData = [];
            const postData = req.query;
            postData.user_id = req.user?.user_id || null;
            connection = await dbPool.getConnection();
            let getRefundData = await RideModel.GetBookingRefund(connection,postData);
            
            
            // return res.status(200).json({
            //     status: 1,
            //     message: "Fetch Successful!",
            //     data: getRefundData.data
            // });
            return res.send(getRefundData);
        } catch (error) {
            console.error("Refund Flight Booking View Error:", error);
            return res.send({
                status: 0,
                message: error.message || CustomMessages.somethingWrong(),
                errors: error
            });
        } finally {
            if (connection) connection.release();
        }
    }
    async getRefundReceipt(req, res) {
        let connection;
        try {
            const postData = req.query;
            postData.user_id = req.user?.user_id || null;
            connection = await dbPool.getConnection();
            let getRefundData = await RideModel.getRefundReceipt(connection,postData);
            return res.send(getRefundData);
        } catch (error) {
            console.error("Refund Flight Booking View Error:", error);
            return res.send({
                status: 0,
                message: error.message || CustomMessages.somethingWrong(),
                errors: error
            });
        } finally {
            if (connection) connection.release();
        }
    }

    static async DownloadFlightTicket(req, res) {
        let connection;
        try {
            const { app_reference } = req.query;
            connection = await dbPool.getConnection();

            // Fetch ticket data
            const Ticket = await ReportModel.GetTrainTicket(
                connection,
                app_reference,
                req.query,
                req.user.user_id
            );

            if (!Ticket || !Ticket.train || Ticket.train.length === 0) {
                return res.status(200).json({
                    status: 0,
                    message: CustomMessages.noResultsFound(),
                    errors: [CustomMessages.noResultsFound()]
                });
            }

            // console.log('=== Ticket Data ===');
            // console.log('Train:', Ticket.train);
            // console.log('Passengers:', Ticket.passenger);

            // Create PDF
            const doc = new PDFDocument({
                margin: 40,
                size: 'A4',
                bufferPages: true
            });

            // Set response headers for PDF download
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="Ticket-${app_reference}.pdf"`
            );

            // Pipe PDF to response
            doc.pipe(res);

            // Generate ticket content
            // Check if Ticket.train is array or single object
            const trainData = Array.isArray(Ticket.train) ? Ticket.train[0] : Ticket.train;
            const passengerData = Ticket.passenger || [];
            try {
                await RideService.generateTicketPDF(req.query,doc, trainData, passengerData);
            } catch (pdfError) {
                console.error('PDF Generation Error:', pdfError);
                // If PDF generation fails, send error in doc
                doc.fontSize(16).text('Error generating ticket PDF', 100, 100);
                doc.fontSize(12).text(`Error: ${pdfError.message}`, 100, 130);
            }

            // Finalize PDF
            doc.end();

        } catch (error) {
            console.error("Error in download ticket:", error);
            console.error("Stack:", error.stack);

            // If headers not sent yet, send JSON error
            if (!res.headersSent) {
                return res.status(500).json({
                    status: 0,
                    message: CustomMessages.serverMsg(),
                    errors: [error.message || CustomMessages.serverMsg()]
                });
            }
        } finally {
            connection?.release();
        }
    }
}

module.exports = new RideController(); 
