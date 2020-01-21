/************************
DOM Helpers
*************************/

const qs = document.querySelector.bind(document);
const qsa = document.querySelectorAll.bind(document);

function el(tag, text = '') {
	const e = document.createElement(tag);
	e.textContent = text;
	return e;
}

function el2(tag, nodes = [], attrs = {}) {
	const e = document.createElement(tag);
	for (const n of nodes)
		e.append(n);
	for (const key in attrs)
		e.setAttribute(key, attrs[key]);
	return e;
}

function empty(node) {
	while (node.firstChild)
		node.removeChild(node.firstChild);
	return node;
}

const addClass = (selector, _class) => qs(selector).classList.add(_class);
const removeClass = (selector, _class) => qs(selector).classList.remove(_class);
const toggleClass = (selector, _class) => qs(selector).classList.toggle(_class);
const setAttr = (selector, attr, val) => qs(selector).setAttribute(attr, val);
