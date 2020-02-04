'use strict';
// from config.js and domhelpers.js
/* global qs, qsa, el, el2, CONF, L, addClass, removeClass, empty */

/************************
Core Data Structures
*************************/

function API(conf) {
	const server = conf.api_server;
	let info = null;

	// load server info
	this.load = () =>
		fetch(`${server}/api/info`)
			.then(r => r.json())
			.then(_info => { info = _info });

	this.hasActiveService = function() {
		const nowYYYYMMDD = parseInt((new Date()).toISOString().substring(0, 10).replace(/-/g, ''));
		const earliest = info.service_date_range[0];
		const latest = info.service_date_range[1];
		return nowYYYYMMDD > earliest && nowYYYYMMDD < latest;
	}

	this.getMapDefaultLocation = () => L.latLng(
		info.default_location['lat'],
		info.default_location['lon']
	);

	this.fetchNearbyStops = function(bounds, func) {
		// north-easy and south-west corners of the screen/map
		const ne = bounds.getNorthEast();
		const sw = bounds.getSouthWest();
		const params = new URLSearchParams({
			'high_lat': ne.lat, 'high_lon': ne.lng,
			'low_lat': sw.lat, 'low_lon': sw.lng,
			'count': info.max_page_size
		}).toString();

		return fetch(`${server}/api/stops/locate?${params}`)
			.then(r => r.json())
			.then(func)
	}

	this.fetchAllRoutes = (func) =>
		fetch(`${server}/api/routes/list`)
			.then((r) => r.json())
			.then(func)

	this.fetchRouteStops = (route, func) =>
		fetch(`${server}/api/stops/list?route_id=${route.getRouteId()}`)
			.then((r) => r.json())
			.then(func)

	this.fetchRouteLayer = (route, func) =>
		fetch(`${server}/api/route/${route.getRouteId()}/geojson`)
			.then((r) => r.json())
			.then(func)
}

function Stop(d, color) {
	// data accessors
	this.getStopCode = () => d.stop_code;
	this.getStopId = () => d.stop_id;
	this.getShortName = () => d.stop_code || `Stop ID: ${d.stop_id}`;
	this.getFullName = () => d.stop_name || `Stop ID: ${d.stop_id}`;

	// predicates
	this.matchesFilter = (str) =>
		str.length == 0 || this.getFullName().toLowerCase().includes(str);

	// the HTML icon used on the map to mark a stop
	const divIcon = el2(
		'div',
		[ this.getShortName() ],
		{ 
			class: 'div-icon-inner',
			style: `border-color: ${color}; color: ${color};`,
			title: `ID: ${d.stop_id}`
		}
	);

	this.getMarker = () => divIcon;

	// construct and return the popup HTML for the given stop
	const popupHTML = () => {
		// 'View Schedule' Link
		const attributes = {target: '_blank', href: `schedule.html?stop=${d.stop_id}`, class: 'view-schedule'};
		const scheduleLink = el2('a', ['View Schedule'], attributes);
		const makeRow = (head, value) => el2('tr', [ el('th', head), el('td', value) ]);
		return el2('p', [
			el('h2', `${this.getFullName()}`),
			el2('table', [
				makeRow('Code', d.stop_code || 'N/A'),
				makeRow('Name', d.stop_name || 'N/A'),
				makeRow('Desc', d.stop_desc || 'N/A'),
				makeRow('Location', `${d.stop_lon}, ${d.stop_lat}`),
			]),
			scheduleLink
		]);
	}

	// create the stop marker layer using the divIcon
	const layer = L.marker(
		[d.stop_lat, d.stop_lon],
		{icon: L.divIcon({className: 'div-icon', html: divIcon})}
	).bindPopup(popupHTML(), {autoPan: true});

	this.getLayer = () => layer;
	this.show = (map) => map.addLayer(layer);
	this.hide = () => layer.remove();

	// handler when clicking a stop from the sidebar
	this.open = () => {
		// this.show(map);
		// map.flyTo(layer.getLatLng(), 17); // fly to it
		layer.openPopup(); // toggle popup
	}

	// enable highlighted marker style
	const addHoverStyle = () =>  {
		divIcon.classList.add('div-icon-inner-hover');
		divIcon.parentNode.classList.add('div-icon-hover');
	}

	// disable highlighted marker style
	const removeHoverStyle = () =>  {
		divIcon.classList.remove('div-icon-inner-hover');
		divIcon.parentNode.classList.remove('div-icon-hover');
	}

	layer.on('popupopen', addHoverStyle);
	layer.on('popupclose', removeHoverStyle);

	// create the sidebar list item HTML that does not depend on the map
	// NOTE: We create this once to avoid issues of callbacks not firing in case this gets destroyed
	const listItemHTML = (() => {
		// create the colored square indicating the stop color
		const colorIndicatorDiv = el2('div', [],
			{class: 'color-indicator', style: `background-color: ${color};`});

		// create the list element
		const li = el2('li',
			[colorIndicatorDiv, this.getFullName()],
			{title: 'Click to View', value: d.stop_id});

		// event handlers: alter marker appearance based on mouse motion or clicks
		li.addEventListener('click', () => this.open());
		li.addEventListener('mouseenter', addHoverStyle);
		li.addEventListener('mouseleave', () => {
			if (!layer.isPopupOpen()) // only remove style if popup is not open
				removeHoverStyle();
		});
		
		return li;
	})();

	this.getListItemHTML = () => {
		if (!layer.isPopupOpen())
			removeHoverStyle();
		return listItemHTML;
	};
	//this.hideListItem = () => listItemHtml.style = "display: none;";
	//this.showListItem = () => listItemHtml.style = "";
}

function Route(d, color) {
	//this.d = d; // route JSON info

	let layer = null; // geojson/shape layer
	const stops = []; // array of Stop() objects

	// data accessors
	this.getRouteId = () => d.route_id;
	this.getFullName = () => `${d.route_short_name} - ${d.route_long_name} - ${d.route_id}`;
	//this.getStopIDs = () => stops.map(s => s.d.stop_id);
	this.getStops = () => stops;
	this.getLayer = () => layer;

	// map manipulation
	this.show = (map) => layer && map.addLayer(layer);
	this.hide = () => layer && layer.remove();
	this.showStops = (map) => stops.forEach(s => s.show(map));
	this.hideStops = () => stops.forEach(s => s.hide());
	this.hideAll = () => {
		if (layer) {
			this.hide();
			this.hideStops();
		}
	}

	const popupHTML = () =>
		el2('p', [
			el('h2', this.getFullName()),
			el('div', `Short Name: ${d.route_short_name}`),
			el('div', `Long Name: ${d.route_long_name}`),
			el('div', `Route ID: ${d.route_id}`),
			el2('div', [`${stops.length} stops`], {class: 'bold'})
		]);

	const fetchStops = (api) =>
		api.fetchRouteStops(this, (stopsData) =>
			stopsData.forEach(data => stops.push(new Stop(data, color))));

	const fetchLayer = (api) =>
		api.fetchRouteLayer(this, (geojson) => {
			const style = {color: color, weight: 6};
			const opts = {style: (() => style)};
			const routeLayer = L.geoJSON(geojson, opts).bindPopup(popupHTML());
			layer = routeLayer;
		});

	this.load = (api) =>
		fetchStops(api).then(() => fetchLayer(api))

	this.open = (map, showRouteStops = true) => {
		this.show(map);
		layer.openPopup();
		map.flyToBounds(layer.getBounds());
		if (showRouteStops)
			this.showStops(map);
	}

	this.getListItemHTML = function(api, map, state) {
		const checkbox = el2('input', [], {type: 'checkbox'});
		// add handler to load and/or show route
		checkbox.addEventListener('input', (e) => {
			// use checkbox to determine if open() shows stops
			const showRouteStops = qs('#show-route-stops').checked;
			if (layer === null) {
				// disable the sidebar temporarily
				disableSidebar();
				// load stop, open, and re-enable sidebar
				this.load(api)
					.then(() => this.open(map, showRouteStops))
					.then(() => enableSidebar())
					.then(() => update(api, map, state));
			} else {
				if (e.target.checked) // route was checked
					this.open(map, showRouteStops);
				else
					this.hideAll();
				update(api, map, state);
			}
		});

		// append checkbox and route name to a <label>
		const label = el2('label',
			[checkbox, this.getFullName()],
			{title: 'Click to View'}
		);

		// append label to an <li> and return it
		return el2('li', [label]);
	}
}

/************************
DOM Wrangling
*************************/

const hide = (selector) => qs(selector).classList.add('hidden');
//const show = (selector) => qs(selector).classList.remove('hidden');
const toggle = (selector) => qs(selector).classList.toggle('hidden');

function toggleStopsSidebar() {
	// hide/toggle sidebars
	hide('#routes-sidebar');
	toggle('#stops-sidebar');
	// set button toggled state
	addClass('#toggle-stops', 'toggled');
	removeClass('#toggle-routes','toggled');
	// focus map
	qs('#map').focus();
}

function toggleRoutesSidebar() {
	// hide/toggle sidebars
	hide('#stops-sidebar')
	toggle('#routes-sidebar');
	// set button toggled state
	addClass('#toggle-routes', 'toggled');
	removeClass('#toggle-stops', 'toggled');
	// focus map
	qs('#map').focus();
}

function disableSidebar() {
	qsa('.sidebar input').forEach(e => e.setAttribute('disabled', ''));
	qsa('.sidebar').forEach(e => e.classList.add('loading'));
}

function enableSidebar() {
	qsa('.sidebar input').forEach(e => e.removeAttribute('disabled'));
	qsa('.sidebar').forEach(e => e.classList.remove('loading'));
}

/************************
Update Functions
*************************/

function updateStopsSidebar(api, map, state) {
	let nearbyStops = [];
	let routeStops = [];

	// if showing nearby stops, include them
	if (qs("#show-nearby-stops").checked)
		nearbyStops = state.stops;

	// if showing route stops, include them
	if (qs("#show-route-stops").checked)
		routeStops = (state.routes.map(r => r.getStops())).flat();

	const allStops = nearbyStops.concat(routeStops);
	const visibleStops = allStops.filter(s => map.hasLayer(s.getLayer()));

	// separate stops by those passing or failing the filter
	const stopsPassingFilter = [];
	const stopsFailingFilter = [];
	const filter = qs('#filter-stops').value.toLowerCase();
	for (let s of visibleStops) {
		if (s.matchesFilter(filter))
			stopsPassingFilter.push(s);
		else
			stopsFailingFilter.push(s)
	}

	// gray-out the stops that dont match filter
	for (const stop of stopsFailingFilter)
		stop.getMarker().classList.add('div-icon-inner-inactive');

	// un-gray-out the stops that do match filter
	for (const stop of stopsPassingFilter)
		stop.getMarker().classList.remove('div-icon-inner-inactive');
	
	// sort passing stops array by stop code and append to a fragment
	stopsPassingFilter.sort((a,b) => a.getStopCode() - b.getStopCode());
	const fragment = new DocumentFragment();
	stopsPassingFilter.forEach(s => fragment.append(s.getListItemHTML(map)));

	// replace stops list with fragment contents
	empty(qs('#stops-list')).append(fragment);

	// update stops message
	let message =  'Zoom-In to locate nearby stops';
	if (stopsFailingFilter.length > 0)
		message = `Showing ${stopsPassingFilter.length}/${visibleStops.length} Stops`;
	else if (visibleStops.length > 0)
		message = `Showing ${visibleStops.length} Stops`;

	qs('#stops-message').textContent = message;
}

function updateNearbyStops(stopsData, api, map, state) {
	// get a list of stop IDS for layers already on map
	const activeStopIDs = [].concat(
		state.routes.map(r => r.getStops().map(s => s.getStopId())).flat(), // route stop ids
		state.stops.map(s => s.getStopId()) // 'nearby' stop ids
	);

	// only process stops that are not currently active
	const newStops = stopsData.filter(s => !activeStopIDs.includes(s.stop_id));
	newStops.forEach(stopData => {
		// create new stop object
		const stop = new Stop(stopData, 'black', map);
		state.stops.push(stop);
	});

	// show all stops in screen bounds and hide all others
	const mapBounds = map.getBounds();
	state.stops.forEach(s => {
		if (mapBounds.contains(s.getLayer().getLatLng()))
			s.show(map);
		else
			s.hide();
	})
}

function update(api, map, state) {
	const showNearbyStops = qs('#show-nearby-stops').checked;

	if (map.getZoom() >= 16 && showNearbyStops) {
		const screen = map.getBounds();
		api.fetchNearbyStops(screen, function(stopsData) {
			updateNearbyStops(stopsData, api, map, state);
			updateStopsSidebar(api, map, state);
		});
	} else {
		updateStopsSidebar(api, map, state);
	}

	// update the location status
	const lat =  map.getCenter().lat.toFixed(4);
	const lon = map.getCenter().lng.toFixed(4);
	const zoom = map.getZoom();
	qs('#status-lat-lon-zoom').textContent = `${lon} lon / ${lat} lat / ${zoom} zoom`;

	// focus on map screen
	qs('#map').focus();
}

function initRouteList(api, map, state) {
	const colors = [ "red", "forestgreen", "blue", "orange", "blueviolet", "magenta", "coral", "darkcyan", "deeppink", "slategray"];
	return api.fetchAllRoutes(function(routes) {
		routes.forEach((route, idx) => {
			const color = colors[idx % colors.length];
			state.routes.push(new Route(route, color, map))
		});
	}).then(function() {
		const routesFragment = new DocumentFragment();
		state.routes.forEach(r => routesFragment.append(r.getListItemHTML(api, map, state)));
		empty(qs('#routes-list')).append(routesFragment);
	});
}

/************************
Init Functions
*************************/

function initUIState() {
	// show map + toolbar
	qs('#toolbar').style = '';
	// Set control UI state
	qs('#filter-stops').value = ''
	qs('#show-nearby-stops').checked = true
	qs('#show-route-stops').checked = true;
	toggleStopsSidebar();
}

function initUIHandlers(api, map, state) {
	// zoom and drag callbacks
	map.on({'moveend': () => update(api, map, state)});

	// Toolbar stop/route buttons
	qs('#toggle-routes').addEventListener('click', toggleRoutesSidebar);
	qs('#toggle-stops').addEventListener('click', toggleStopsSidebar);

	// routes sidebar: clear route button
	qs('#clear-routes').addEventListener('click', () =>  {
		state.routes.forEach(r => { r.hideAll() });
		qsa('#routes-list :checked').forEach(e => e.checked = false);
	});

	// stops sidebar: filter stops textbox
	qs('#filter-stops').addEventListener('input', () =>
		updateStopsSidebar(api, map, state));

	// stops sidebar: show nearby stops checkbox
	qs('#show-nearby-stops').addEventListener('input', (e) => {
		if (!e.target.checked)
			state.stops.forEach(s => s.hide());
		update(api, map, state);
	});

	// stops sidebar: show route stops checkbox
	qs('#show-route-stops').addEventListener('input', function(e) {
		if (e.target.checked)
			state.routes.forEach(r => {
				if (map.hasLayer(r.getLayer())) // show stops for layers on map
					r.showStops(map);
			});
		else
			state.routes.forEach(r => r.hideStops());
		update(api, map, state);
	});
}

function initSlippyMap(api) {
	// initialize slippy map
	const defaultZoom = 12
	const defaultLocation = api.getMapDefaultLocation();

	const map = L.map('map').setView(defaultLocation, defaultZoom, {
		closeOnClick: true,
		fadeAnimation: false,
		markerZoomAnimation: false
	});

	// set the map tiles provider
	/*L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {*/
	L.tileLayer(CONF.tiles.servers, {
		maxZoom: 19,
		attribution: (`&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a> | ${CONF.tiles.attribution}`)
	}).addTo(map);

	return map;
}

function initVerifyService(api) {
	// check if service dates are valid, otherwise show an alert
	if (!api.hasActiveService())
		alert('WARNING: Current date outside service range, schedules will be unavailable')
}

function init(api) {
	// tracking a list of routes and stops objects currently loaded
	// see the Route and Stop constructor functions above
	const state = { routes: [], stops: [] };

	// initialize map
	const map = initSlippyMap(api);

	// initialize UI
	initUIState();
	initUIHandlers(api, map, state);
	initVerifyService(api);
	initRouteList(api, map, state)
		.then(() => update(map, map, state));
}

window.addEventListener('load', function() {
	const api = new API(CONF);
	api.load()
		.catch(() => qs('#error').textContent = 'Unable to load transit data, please try again later')
		.then(() => init(api));

	/*fetch(CONF.api_server + '/api/info')
		.then(r => r.json())
		.then(info => init(new API(CONF.api_server, info)));*/
});
