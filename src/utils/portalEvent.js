// React bubbles events along the component tree, through portals: a touch in
// a sheet (portalled to <body>) still reaches handlers on the page content
// that renders it. True when the event's target is not inside the DOM of the
// element whose handler is running.
export const isFromPortal = (event) => !event.currentTarget.contains(event.target)
