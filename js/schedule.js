'use strict';
// from config.js and domhelpers.js
/* global qs, qsa, el, el2, CONF, empty */

// retrun true if dates d1 an d2 occur on the same day
function onSameDay(d1, d2) {
	return (d1.getDate() == d2.getDate()) &&
		(d1.getMonth() == d2.getMonth()) &&
		(d1.getYear() == d2.getYear());
}

// parse time in format: 05:30:03
function updateDateTime(date, timeString) {
	const toks = timeString.split(':');
	date.setHours(toks[0]);
	date.setMinutes(toks[1]);
	return date;
}

// parse an iso string ("yyyy-mm-dd") and return a new date object
function parseISODate(str) {
	return new Date(
		str.substring(0,4), // year
		parseInt(str.substring(5,7)) - 1, // month index
		str.substring(8,10) // day
	);
}

function routeFullName(r) {
	return `${r.route_short_name} - ${r.route_long_name}`;
}

// increment or decrement magitude by dayCount (can be negative)
function incDateByDays(date, dayCount) {
	date.setTime(date.getTime() + (dayCount * (1000*60*60*24)));
	return date;
}

function loadSchedule(stop, date) {
	// clear old table and next arrival link
	const table = qs('#schedule-table');
	table.classList.add('loading');

	// remove callbacks on buttons and disable them
	qsa('#schedule-date, #schedule-next, #schedule-prev').forEach(e => {
		const clone = e.cloneNode(true);
		e.replaceWith(clone);
		clone.setAttribute('disabled', '');
	});

	// setup new callbacks
	qs('#schedule-date').addEventListener('change',
		(e) => loadNewSchedule(stop, parseISODate(e.target.value)));
	qs('#schedule-next').addEventListener('click',
		(e) => loadNewSchedule(stop, incDateByDays(date, 1)));
	qs('#schedule-prev').addEventListener('click', 
		(e) => loadNewSchedule(stop, incDateByDays(date, -1)));

	// Get 'yyyy-mm-dd' ISO string
	const isodate = date.toISOString().substring(0, 10)
	const stopFullName = stop.stop_name;
	const pageTitle = 'Arrivals - ' + stopFullName + ' - ' + isodate;

	// set the title
	qs('title').textContent = pageTitle;
	qs('#schedule-title').textContent = stopFullName;
	qs('#schedule-date').value = isodate;

	fetch(CONF.api_server + `/api/stop_times/${stop.stop_id}/schedule?date=${isodate}`)
		.then(r => r.json())
		.then(function(schedule) {

			// set schedule count
			//qs('#schedule-count').textContent = schedule.length + ' arrivals';

			// state used to find and highlight the next stop from the schedule lines
			let nextStopFound = false;
			let scheduleDate = new Date(date.getTime()); // clone the main date object
			const now = new Date();
			const sameDay = onSameDay(scheduleDate, now);
			const tableInner = new DocumentFragment();

			// append table header row
			tableInner.append(el2('tr', [
				el('th', 'No.'),
				el('th', 'Time'),
				el('th', 'Route'),
				el('th', 'Headsign')
			]));

			// append schedule lines
			schedule.forEach((ent, i) => {
				const row = el2('tr', [
					el('td', i+1),
					el('td', ent.arrival_time),
					el('td', routeFullName(ent)),
					el('td', ent.trip_headsign)
				]);

				// if the calendar day matches today and we havent found the
				// next occuring stop and the arrival time is later than the
				// current moment, set this row in the table as the next
				// arrival
				if (sameDay && !nextStopFound && updateDateTime(scheduleDate, ent.arrival_time) > now) {
					row.setAttribute('id', 'next-arrival');
					row.setAttribute('title', 'Upcoming arrival');
					row.style = 'cursor: help;';
					row.classList.add('highlight', 'bold');
					nextStopFound = true;
				}
				
				// append the table row to DOM
				tableInner.append(row);
			});


			// empty table
			empty(table);

			// append schedule rows
			table.append(tableInner);;

			table.classList.remove('loading');
			// enable controls again
			qsa('input, button').forEach(e => e.removeAttribute('disabled'));
		});
}

function loadNewSchedule(stop, newdate) {
	// date to ISO
	const isodate = newdate.toISOString().substring(0, 10)
	// update URL and push browser history
	const url = new URL(window.location);
	url.hash = ''; // clear jump-to permalink
	// update 'stop' and 'date' query params
	url.search = new URLSearchParams({'stop': stop.stop_id, 'date': isodate});
	// push browser state
	history.pushState({'stop': stop, 'date': newdate}, '', url.toString());
	// load schedule with new date
	loadSchedule(stop, newdate);
}

window.addEventListener('load', function() {
	const url = new URL(window.location);
	const searchParams = new URLSearchParams(url.search);
	const stopID = searchParams.get('stop');
	const dateParam = searchParams.get('date');

	// use current time if dateParam is empty
	let date;
	if (dateParam == null)
		date = new Date();
	else
		date = parseISODate(dateParam);

	// load the stop info for this ID
	fetch(CONF.api_server + '/api/stops/id/' + stopID)
		.then(r => r.json())
		.then(stop => {
			// set history state for first schedule page load (immediately after clicking 'View Schedule')
			history.replaceState({'stop': stop[0], 'date': date}, '', window.location);
			loadSchedule(stop[0], date, []);
		});
});


// user clicks back button
window.addEventListener('popstate', function(popstate) {
	const state = popstate.state;
	if (state)
		loadSchedule(state.stop, state.date);
});


