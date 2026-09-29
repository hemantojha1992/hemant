const FlightService = require('../services/flight.service');
const CustomMessages = require("../../utilities/customMessages");
let dbPool = require('../../database/db1');
const FlightModel = require('../models/flight.model');
const CustomModel = require('../../models/CustomDbModel');
const batch = require('../../database/GroupUpdateInsert');
const ReportModel = require('../models/report.model');
const { setCacheData, getCacheData } = require("../../../shared/redis/Redis");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const moment = require('moment');


class ReportController {

    async GetFlightBookingReport(req, res) {
        let params = req.query; 
        let connection;
        const agentId  = req.user.user_id;
        if (!agentId) {
            return res.status(400).json({
                status: 0,
                message: "agent_id is required in request body",
                errors: ["agent_id is required"]
            });
        }
        try {
            connection = await dbPool.getConnection();
            const reportData = await FlightModel.GetFlightBookingData(connection, agentId, params);
            if(reportData && reportData.status){
                return res.status(200).json({
                    status: 1,
                    message: "Flight Booking Report Fetched Successfully",
                    data: reportData.data
                });
            }else{
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
        finally{
            if(connection){ connection.release(); }
        }
    }

    async DownloadFlightTicket(req, res) {
        let connection;
        try {
            const { app_reference } = req.body;
            connection = await dbPool.getConnection();
            // Fetch ticket data
            //const Ticket = await ReportModel.GetFlightTicketDetail(connection,app_reference,req.query,req.user.user_id);
            const Ticket = await ReportModel.getNewBookingDate(connection,app_reference);
            //console.log("Ticket Data:", Ticket);return false;
            if (!Ticket || Ticket.bookDetails.length === 0) {
                return res.status(200).json({
                    status: 0,
                    message: CustomMessages.noResultsFound(),
                    errors: [CustomMessages.noResultsFound()]
                });
            }
            // Create PDF
            const doc = new PDFDocument({
                size: 'A4',
                layout: 'portrait',
                margins: {
                    top: 20,
                    bottom: 20,
                    left: 20,
                    right: 20
                },
                bufferPages: true
            });
            // Set response headers for PDF download
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition',`attachment; filename="Ticket-${app_reference}.pdf"`);
            // Pipe PDF to response
            doc.pipe(res);
            try {
                await ReportController.generateTicketPDF(doc, Ticket,app_reference);
            } catch (pdfError) {
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

    static async generateTicketPDF(doc, flightTicketDetail,app_reference) {

        let agency_email = flightTicketDetail.bookDetails?.agency_email || 'deepak2009.sdl@gmail.com';
        let agency_phone = flightTicketDetail.bookDetails?.agency_phone || '+91 9425182794';
        let agency_address = flightTicketDetail.bookDetails?.agency_address || 'SINGHPUR ROAD INDRA CHOWK';
        // HEADER
        doc.fillColor('#0d4c6a').roundedRect(30, 20, 350, 120, 20).fill();
        doc.fillColor('white').fontSize(12).text(flightTicketDetail.bookDetails?.agency_name || 'ANUPAM TRAVELS AND MOBILE PARLOUR', 50, 35);
        
        doc.fontSize(12).text(`Email: ${agency_email}`, 50, 60);
        doc.text(`Phone: ${agency_phone}`, 50, 80);
        doc.text(`Address: ${agency_address}`, 50, 100);

        // LOGO
        const path = require('path');
        doc.image( path.join(__dirname, '../../../system/logo/logo.png'),400,75,{ width: 170 } );
        let y = 160;

        // BOOKING DETAILS TITLE
        doc.fillColor('#d8e3ea').rect(30, y, 535, 20).fill();
        doc.fillColor('black').fontSize(13).text('Booking Details', 40, y + 6);
        
        y += 30;
        // TABLE HEADER
        doc.fillColor('#0d4c6a').rect(30, y, 535, 30).fill();
        doc.fillColor('white');

        doc.text('Booking ID', 40, y + 8);
        doc.text('Booking Time', 170, y + 8);
        doc.text('PNR No.', 350, y + 8);
        doc.text('Status', 500, y + 8);

        y += 30;
        // TABLE DATA
        doc.fillColor('black').rect(30, y, 535, 50).stroke();
        doc.text(app_reference, 40, y + 15, {
            width: 120,
            ellipsis: true
        });
        const pax = flightTicketDetail.pax?.[0] || {};
        const formattedDate = pax.created_datetime
            ? new Date(pax.created_datetime)
                .toISOString()
                .replace('T', ' ')
                .replace(/\..+/, '')
            : '';
        doc.text(formattedDate, 170, y + 15, {
            width: 140
        });
        const pnrText = flightTicketDetail.flight
            .map(flight =>
                `${flight.from_airport_code}-${flight.to_airport_code}:${flight.airline_pnr}`
            ).join(', ');
        doc.text(pnrText, 340, y + 15, {
            width: 140,
            ellipsis: true
        });

        // Status
        let bookingStatus = 'N/A';

        if (flightTicketDetail.bookDetails?.booking_status) {
            const parts = flightTicketDetail.bookDetails.booking_status.split('_');
            bookingStatus = parts[1] || flightTicketDetail.bookDetails.booking_status;
        }
        doc.text(bookingStatus, 500, y + 15, {
            width: 50,
            align: 'center'
        });

        y += 70;
        // FLIGHT DETAILS
        doc.fillColor('#d8e3ea').rect(30, y, 535, 25).fill();
        doc.fillColor('black').fontSize(14).text('Flight Details', 40, y + 5);
        y += 20;
        flightTicketDetail.flight.forEach((flight, index) => {
            y += 10;
            doc.fillColor('#dddddd').rect(30, y, 535, 30).fill();
            doc.fillColor('black').fontSize(14);
            // Header Row
            doc.text(`Flight ${index + 1}`, 40, y + 8);
            doc.text('Departing', 170, y + 8);
            doc.text('Arriving', 350, y + 8);
            doc.text('Duration', 500, y + 8);

            y += 40;
            const logoPath = path.join(
                __dirname,
                '../../../system/flight_img/',
                `${flight.airline_code}.gif`
            );

            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 20, y, {
                    width: 25,
                    height: 25
                });
            }

            // Airline Name
            doc.fontSize(10)
            .text(
                flight.airline_name || '',
                70,
                y,
                { width: 100 }
            );

            // Flight Code
            doc.fontSize(12)
            .fillColor('gray')
            .text(
                `${flight.airline_code}-${flight.flight_number}`,
                70,
                y + 12
            )
            .fillColor('black');
            // Data Row
            const departureDate = flight.departure_datetime
            ? new Date(flight.departure_datetime)
                .toLocaleString('en-US', {
                    month: 'short',
                    day: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                })
            : '';

            doc.fontSize(14)
            .fillColor('#111111')
            .text(departureDate, 170, y);

            doc.fontSize(10).text(flight.from_airport_name || '',170,y + 18,{underline: true});

            doc.fontSize(14).text(flight.origin_terminal ? `Terminal ${flight.origin_terminal}` : '', 170, y + 36 );
            const arrivalDate = flight.arrival_datetime
            ? new Date(flight.arrival_datetime)
                .toLocaleString('en-US', {
                    month: 'short',
                    day: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                })
            : '';

            doc.fontSize(14)
            .fillColor('#111111')
            .text(arrivalDate, 350, y);

            doc.fontSize(10).text( flight.to_airport_name || '', 350, y + 18, { underline: true } );

            doc.fontSize(14).text(flight.destination_terminal ? `Terminal ${flight.destination_terminal}` : '', 350, y + 36 );
            const departure = new Date(flight.departure_datetime).getTime();
            const arrival = new Date(flight.arrival_datetime).getTime();

            const diffSeconds = (arrival - departure) / 1000;
            const hours = Math.floor(diffSeconds / 3600);
            const minutes = Math.floor((diffSeconds % 3600) / 60);

            const durationFormatted =
                `${String(hours).padStart(2, '0')} h ${String(minutes).padStart(2, '0')} m`;
            let durationColumnText = durationFormatted + '\n\n';
            flightTicketDetail.pax.forEach((pax) => {
                let handVal = '7KG';
                let cabinVal = '15KG';
                if (pax.bag_json && pax.bag_json !== 'null') {
                    try {
                        const baggage = JSON.parse(pax.bag_json);
                        const baggKey =
                            flight.from_airport_code +
                            flight.to_airport_code;

                        if (baggage.hand?.[baggKey]) {
                            handVal = baggage.hand[baggKey];
                        }
                        if (baggage.cabin?.[baggKey]) {
                            cabinVal = baggage.cabin[baggKey];
                        }
                    } catch (e) {}
                }
                durationColumnText +=
                    `${pax.title} ${pax.first_name} ${pax.last_name}\n` +
                    `${handVal} / ${cabinVal}\n\n`;
            });
            doc.fontSize(9).fillColor('black');
            doc.text(
                durationColumnText,
                500,
                y,
                {
                    width: 120,
                    lineGap: 2
                }
            );
            // IMPORTANT: Row height dynamic rakho
            const durationHeight = doc.heightOfString(durationColumnText, {
                width: 120
            });
            y += Math.max(durationHeight + 20, 30);
            //y += 35;
        });

        y += 30;
        // PASSENGER DETAILS
        doc.fillColor('#d8e3ea').rect(30, y, 535, 25).fill();
        doc.fillColor('black').fontSize(14).text('Passenger Details', 40, y + 5);

        y += 30;
        doc.fillColor('#dddddd').rect(30, y, 535, 30).fill();
        doc.fillColor('black').fontSize(11);
        doc.text('Sr.', 35, y + 8);
        doc.text('Passenger Name', 60, y + 8, {
            width: 130
        });
        doc.text('PNR / Ticket No.', 200, y + 8, {
            width: 90
        });
        doc.text('Baggage', 300, y + 8, {
            width: 80
        });
        doc.text('Meal / Seat', 390, y + 8, {
            width: 70
        });
        doc.text('Passport Details', 470, y + 8, {
            width: 90
        });
        y += 30;
        let sr = 1;
        for (const traveller of flightTicketDetail.pax) {
            const fullName =
                `${traveller.title} ${traveller.first_name} ${traveller.last_name}`.toUpperCase();
            doc.rect(30, y, 535, 60).stroke();
            doc.text(String(sr), 35, y + 10, {
                width: 20
            });
            doc.text(`${fullName} (${traveller.passenger_type})`,60,y + 10,{width: 140});
            doc.text(`${flightTicketDetail.flight[0].airline_pnr || ''}/${traveller.ticket_no || ''}`,200,y + 10,{width: 100});
            doc.text(traveller.baggage_description || 'N/A',300,y + 10,{width: 90});
            let mealSeat = '';
            if (traveller.meal_description) {
                mealSeat += `Meal: ${traveller.meal_description}\n`;
            }
            if (traveller.seat) {
                mealSeat += `Seat: ${traveller.seat}`;
            }
            doc.text(mealSeat || 'N/A',390,y + 10,{width: 80});

            // Passport Details
            let passportText = 'N/A';
            if (traveller.passport_number) {
                passportText =
                    `Passport: ${traveller.passport_number}\n` +
                    `Issue: ${traveller.passport_issuing_country || ''}\n` +
                    `Expiry: ${traveller.passport_expiry_date || ''}\n` +
                    `Nationality: ${traveller.passenger_nationality || ''}`;
            }
            doc.text(passportText,470,y + 10,{width: 90});
            // Vertical lines
            doc.moveTo(55, y).lineTo(55, y + 60).stroke();
            doc.moveTo(190, y).lineTo(190, y + 60).stroke();
            doc.moveTo(290, y).lineTo(290, y + 60).stroke();
            doc.moveTo(380, y).lineTo(380, y + 60).stroke();
            doc.moveTo(460, y).lineTo(460, y + 60).stroke();

            y += 60;
            // QR/Barcode section (PHP wale second row jaisa)
            if (traveller.passenger_type !== 'INFANT') {
                const qrText =
                    `${traveller.last_name}/${traveller.first_name} ` +
                    `${traveller.from_airport_code}${traveller.to_airport_code} ` +
                    `${traveller.airline_pnr}`;
                doc.rect(30, y, 535, 50).stroke();
                doc.text(`QR Data: ${qrText}`,60,y + 15);
                //y += 50;
            }
            sr++;
        }
        
        //y += 30;
        const secondSectionHeight =
            85 + (flightTicketDetail.pax.length * 110);

        if (y + secondSectionHeight > 750) {
            doc.addPage();
            y =0;
        }
        
        doc.fillColor('#ccd8df')
        .rect(30, y, 535, 30)
        .fill();

        doc.fillColor('black')
        .font('Helvetica')
        .fontSize(14)
        .text('Contact Details', 40, y + 8);

        y += 30;

        // TABLE SETTINGS
        const tableX = 30;
        const tableWidth = 535;
        const leftColWidth = 180;
        const rowHeight = 40;

        // OUTER BORDER
        doc.rect(
            tableX,
            y,
            tableWidth,
            rowHeight * 2
        ).stroke('#d0d0d0');

        // VERTICAL LINE
        doc.moveTo(tableX + leftColWidth, y)
        .lineTo(tableX + leftColWidth, y + (rowHeight * 2))
        .stroke('#d0d0d0');

        // HORIZONTAL LINE
        doc.moveTo(tableX, y + rowHeight)
        .lineTo(tableX + tableWidth, y + rowHeight)
        .stroke('#d0d0d0');

        // EMAIL ROW
        doc.font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#222222')
        .text(
            'Email',
            tableX + 10,
            y + 13
        );

        doc.font('Helvetica')
        .text(
            flightTicketDetail.bookDetails?.email || '',
            tableX + leftColWidth + 10,
            y + 13,
            {
                width: 320
            }
        );

        // PHONE ROW
        doc.font('Helvetica-Bold')
        .text(
            'Phone Number',
            tableX + 10,
            y + rowHeight + 13
        );

        doc.font('Helvetica')
        .text(
            flightTicketDetail.bookDetails?.phone || '',
            tableX + leftColWidth + 10,
            y + rowHeight + 13,
            {
                width: 320
            }
        );
        // NEXT SECTION START POSITION
        y += (rowHeight * 2) + 0;
        // ================== FARE DETAILS ==================

            y += 20;

            doc.fillColor('#ccd8df')
            .rect(30, y, 535, 30)
            .fill();

            doc.fillColor('black')
            .font('Helvetica')
            .fontSize(14)
            .text('Fare Details', 40, y + 8);

            y += 30;

            // Fare Calculation
            let updateInFinal = false;

            const basicFare = Number(
                flightTicketDetail.bookDetails?.basic_fare || 0
            );

            const totalFare = Number(
                flightTicketDetail.bookDetails?.total_fare || 0
            );

            const agentMarkup = Number(
                flightTicketDetail.bookDetails?.agent_markup || 0
            );

            let seatMealBagFare = Number(
                flightTicketDetail.bookDetails?.meal_and_baggage_fare || 0
            );

            if (
                seatMealBagFare === 0 &&
                Number(flightTicketDetail.seatBagMealFare || 0) > 0
            ) {
                seatMealBagFare = Number(
                    flightTicketDetail.seatBagMealFare
                );
                updateInFinal = true;
            }

            const finalShowingFare = totalFare + agentMarkup;

            const showingTax =
                (finalShowingFare - basicFare) - seatMealBagFare;
            const correctionPrice = 0;
            const infantPrice = 0;
            const totalSSRPrice = 0;
            const amendmentCharges =
                Number(correctionPrice || 0) +
                Number(infantPrice || 0) +
                Number(totalSSRPrice || 0);

            let totalPrice =
                amendmentCharges + finalShowingFare;

            if (updateInFinal) {
                totalPrice += seatMealBagFare;
            }

            // Table Rows
            const fareRows = [
                {
                    label: 'Base Price',
                    value: `₹ ${basicFare.toFixed(2)}`
                },
                {
                    label: 'Airlines Tax and Fees',
                    value: `₹ ${showingTax.toFixed(2)}`
                }
            ];

            if (seatMealBagFare > 0) {
                fareRows.push({
                    label: 'Seat, Meal, Bag Fare',
                    value: `₹ ${seatMealBagFare.toFixed(2)}`
                });
            }

            if (amendmentCharges > 0) {
                fareRows.push({
                    label: 'Amendment Charges',
                    value: `₹ ${amendmentCharges.toFixed(2)}`
                });
            }

            fareRows.push({
                label: 'Total Price',
                value: `₹ ${totalPrice.toFixed(2)}`
            });

            // ================== TABLE ==================

            const fareTableX = 30;
            const fareTableWidth = 535;
            const fareLabelWidth = 320;
            const fareRowHeight = 38;
            const fareTableHeight = fareRows.length * fareRowHeight;

            // Outer Border
            doc.rect(
                fareTableX,
                y,
                fareTableWidth,
                fareTableHeight
            ).stroke('#d0d0d0');

            // Vertical Divider
            doc.moveTo(fareTableX + fareLabelWidth, y)
            .lineTo(
                fareTableX + fareLabelWidth,
                y + fareTableHeight
            )
            .stroke('#d0d0d0');

            // Rows
            fareRows.forEach((row, index) => {

                const rowY = y + (index * fareRowHeight);

                // Horizontal Line
                if (index > 0) {
                    doc.moveTo(fareTableX, rowY)
                    .lineTo(
                        fareTableX + fareTableWidth,
                        rowY
                    )
                    .stroke('#d0d0d0');
                }

                // Label
                doc.font('Helvetica-Bold')
                .fontSize(11)
                .fillColor('#222222')
                .text(
                    row.label,
                    fareTableX + 10,
                    rowY + 12
                );

                // Value
                doc.font('Helvetica-Bold')
                .text(
                    row.value,
                    fareTableX + fareLabelWidth + 20,
                    rowY + 12
                );
            });

            y += fareTableHeight + 20;

            // ================== IMPORTANT INFORMATION ==================

            y += 20;

            // Header
            doc.fillColor('#ccd8df')
            .rect(30, y, 535, 30)
            .fill();

            doc.fillColor('black')
            .font('Helvetica')
            .fontSize(14)
            .text('Important Information', 40, y + 8);

            y += 30;

            // Information List
            const importantNotes = [
                'Any Questions? Get in touch with our 24x7 Customer Care team.',
                'Carriage and other services provided by the carrier are subject to conditions of carriage, which are hereby incorporated by reference. These conditions may be obtained from the issuing carrier.',
                'In case of cancellations less than 6 hours before departure, please cancel directly with the airline. We are not responsible for any loss if the request is received less than 6 hours before departure.',
                'Please contact airlines for Terminal Queries.',
                'After booking it is mandatory for all passengers to complete Web Check-in using their PNR to avoid long queues at the airport.',
                'Check-in begins 2 hours prior to the flight departure time.',
                'Passengers travelling with checked-in baggage need to add their baggage during web check-in. Per passenger, 1 piece of checked-in baggage up to 46 Kgs is allowed. In addition, one small hand baggage less than 7 Kgs per passenger is allowed.',
                'Each passenger Contact Number and Email ID is mandatory during booking.',
                'Passenger health declaration status and mobile should have the Aarogya Setu app showing Green status.',
                'Passenger must wear a mask properly at the airport and throughout the journey.',
                'Passenger must sanitize at airports at various points.',
                'Partial cancellations are not allowed for Round-trip fares.',
                'No Show refund should be collected within 90 days from departure date.',
                'Booking Rules will be applicable if passenger countis 9 or more',
                'to airport security regulation,no Hand Baggage is allowed on a ny flights from Jammu and Srinagar airports.',
                'Baggage Allowance: Checkin - 46 kg,Hand baggage - 7kg.',
                
            ];

            // Calculate Dynamic Height
            const infoBoxWidth = 535;
            const infoX = 30;
            const textWidth = 505;
            const padding = 15;

            let totalTextHeight = 0;

            importantNotes.forEach((note) => {
                totalTextHeight += doc.heightOfString(note, {
                    width: textWidth
                }) + 8;
            });

            const infoBoxHeight = totalTextHeight + (padding * 2);

            // Outer Border
            doc.rect(
                infoX,
                y,
                infoBoxWidth,
                infoBoxHeight
            ).stroke('#d0d0d0');

            // Content
            let currentY = y + padding;

            doc.font('Helvetica-Bold')
            .fontSize(11)
            .fillColor('#222222');

            importantNotes.forEach((note) => {

                const noteHeight = doc.heightOfString(note, {
                    width: textWidth
                });

                doc.text(
                    note,
                    infoX + 10,
                    currentY,
                    {
                        width: textWidth,
                        align: 'left'
                    }
                );

                currentY += noteHeight + 8;
            });

            // Move Y for next section
            y += infoBoxHeight + 20;

            // ================== BAGGAGE / DANGEROUS GOODS IMAGE ==================

            y += 20;

            // Image add karne se pehle page space check
            const imageHeight = 140;

            if (y + imageHeight > 750) {
                doc.addPage();
                y = 40;
            }

            // Image Path
            const baggageImagePath = path.join(
                __dirname,
                '../../../system/flight_img/items.png'
            );

            // Image Exists Check
            if (fs.existsSync(baggageImagePath)) {

                // Optional Border
                doc.rect(
                    30,
                    y,
                    535,
                    imageHeight
                ).stroke('#d0d0d0');

                // Image
                doc.image(
                    baggageImagePath,
                    30,
                    y,
                    {
                        width: 535,
                        height: imageHeight
                    }
                );

                y += imageHeight + 20;
            }

        // doc.end();
    }

}

module.exports = new ReportController(); 
