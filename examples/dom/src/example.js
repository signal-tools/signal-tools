import { attrs, group, html, svg, text } from "@signal-tools/dom";
import { Signal } from "@signal-tools/signal";

const viewBox = new Signal.State("0 0 16 16");
const showCheck = new Signal.State(true);

const $svg = svg(
	"svg",
	attrs({
		viewBox,
	}),
	svg(
		"circle",
		attrs({
			cx: 8,
			cy: 8,
			r: 6,
		}),
	),
	group(
		showCheck,
		svg(
			"circle",
			attrs({
				cx: 8,
				cy: 8,
				r: 4,
				fill: "blue",
			}),
		),
		svg(
			"circle",
			attrs({
				cx: 8,
				cy: 8,
				r: 2,
				fill: "lightblue",
			}),
		),
	),
	svg("circle", attrs({ cx: 8, cy: 8, r: 1 })),
);

const heading = new Signal.State("DOM Concept");

const $main = html("main", html("h1", text("Signal "), text(heading), text("!")), $svg);

$main(updateMain);

updateViewbox.onchange = () => viewBox.set(updateViewbox.value);
updateHeading.oninput = () => heading.set(updateHeading.value);
updateShowCheck.onchange = () => showCheck.set(updateShowCheck.checked);
