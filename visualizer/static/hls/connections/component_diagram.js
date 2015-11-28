function doesRectangleOverlap(a, b) {
	  return (Math.abs(a.x - b.x) * 2 < (a.width + b.width)) &&
	         (Math.abs(a.y - b.y) * 2 < (a.height + b.height));
}

function offsetInRoutingNode(node, net){
	var x= 0,
		y= 0;
	
	var xindx= node.vertical.indexOf(net);
	if(xindx > 0)
		x += xindx*NET_PADDING;
	
	var yindx= node.horizontal.indexOf(net);
	if(yindx > 0)
		y += yindx*NET_PADDING;
	
	return [x, y];
}


function pointAdd(a, b){
	return [a[0] +b[0], a[1] + b[1]]
}

function isOnLineVerticaly(line, point){
	if(line[0][1] < line[1][1]){
		var lUp = line[0];
		var lDown = line[1];
	}else{
		var lUp = line[1];
		var lDown = line[0];
	}
	if(lUp[0] != lDown[0]){ // if this is not vertical line, point does not lay
							// on vertically
		return false;
	}
	if(point[0] == lUp[0]){ // x == line.x
		return lUp[1] <= point[1] && point[1] <= lDown[1]; // is between lUp
															// and lDown
															// vertically
	}else{
		return false;
	}
}

function pointEq(pointA , pointB){
	return pointA[0] == pointB[0] && pointA[1] == pointB[1];
}


// used for collision detection, and keep out behavior of nodes
function nodeColisionResolver(node) {
	  var nx1, nx2, ny1, ny2, padding;
	  padding = 32;
	  function x2(node){
		  return node.x + node.width; 
	  }
	  function y2(node){
		  return node.y + node.height; 
	  }
	  nx1 = node.x - padding;
	  nx2 = x2(node) + padding;
	  ny1 = node.y - padding;
	  ny2 = y2(node.y) + padding;
	  
	  
	  return function(quad, x1, y1, x2, y2) {
	    var dx, dy;
		function x2(node){
		 return node.x + node.width; 
		}
		function y2(node){
		 return node.y + node.height; 
		}
	    if (quad.point && (quad.point !== node)) {
	      if (doesRectangleOverlap(node, quad.point)) {
	        dx = Math.min(x2(node)- quad.point.x, x2(quad.point) - node.x) / 2;
	        node.x -= dx;
	        quad.point.x -= dx;
	        dy = Math.min(y2(node) - quad.point.y,y2(quad.point) - node.y) / 2;
	        node.y -= dy;
	        quad.point.y += dy;
	      }
	    }
	    return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
	  };
};

function netMouseOver() {
	var net = d3.select(this)[0][0].__data__.net;
	d3.selectAll(".link")
	  .classed("link-hover", 
			  function(d){
		  			return d.net === net;
	  		  });
}
function higlightNets(nets){
	d3.selectAll(".link")
	  .classed("link-hover", 
			  function(d){
		  			return nets.indexOf(d.net ) >-1; 
	  		  });
}
function netMouseOut() {
	d3.selectAll(".link")
	  .classed("link-hover", false);
}

function addShadows(svg){
	// filters go in defs element
	var defs = svg.append("defs");

	// create filter with id #drop-shadow
	// height=130% so that the shadow is not clipped
	var filter = defs.append("filter")
	    .attr("id", "drop-shadow")
	    .attr("height", "130%");

	// SourceAlpha refers to opacity of graphic that this filter will be applied to
	// convolve that with a Gaussian with standard deviation 3 and store result
	// in blur
	filter.append("feGaussianBlur")
	    .attr("in", "SourceAlpha")
	    .attr("stdDeviation", 1)
	    .attr("result", "blur");

	// translate output of Gaussian blur to the right and downwards with 2px
	// store result in offsetBlur
	filter.append("feOffset")
	    .attr("in", "blur")
	    .attr("dx", 2)
	    .attr("dy", 2)
	    .attr("result", "offsetBlur");

	// overlay original SourceGraphic over translated blurred opacity by using
	// feMerge filter. Order of specifying inputs is important!
	var feMerge = filter.append("feMerge");

	feMerge.append("feMergeNode")
	    .attr("in", "offsetBlur")
	feMerge.append("feMergeNode")
	    .attr("in", "SourceGraphic");

	// gradient
	var minY = 10;
	var maxY = 210;

	var gradient = svg
		.append("linearGradient")
		.attr("y1", minY)
		.attr("y2", maxY)
		.attr("x1", "0")
		.attr("x2", "0")
		.attr("id", "gradient")
		.attr("gradientUnits", "userSpaceOnUse")
    
	gradient
	.append("stop")
	.attr("offset", "0")
	.attr("stop-color", "#E6E6E6")
    
	gradient
    .append("stop")
    .attr("offset", "0.5")
    .attr("stop-color", "#A9D0F5")    
}

function showTooltip(toolTipDiv, html){
	toolTipDiv.transition()        
	    .duration(100)      
	    .style("opacity", .9);      
	toolTipDiv.html(html)
	    .style("left", d3.event.pageX + "px")     
	    .style("top", (d3.event.pageY - 28) + "px");  
}

function hideTooltip(toolTipDiv){
	toolTipDiv.transition()        
		.duration(200)      
		.style("opacity", 0);
}
// move component on its positions and redraw links between them
function updateNetLayout(svgGroup, linkElements, nodes, links){ 
	for(var i =0; i< 1; i++){
		var router = new NetRouter(nodes, links, false);
		var grid = router.grid;
		
		function drawNet(d){
			var pos = d.start.pos();
			var spOffset = offsetInRoutingNode(d.start, d.net);
			// connection from port node to port
			var pathStr = "M " + [pos[0] - COMPONENT_PADDING - d.source.netChannelPadding.right, pos[1]] + "\n"; 
			var posWithOffset = pointAdd(pos, spOffset);
			pathStr += " L " + posWithOffset +"\n";
	
			router.walkLinkSubPaths(d, function(subPath, dir){
				var p0 = subPath[0];
				var p1 = subPath[subPath.length -1];
				
				pathStr += " L " + pointAdd(p0.pos(), offsetInRoutingNode(p0, d.net)); +"\n";
				pathStr += " L " + pointAdd(p1.pos(), offsetInRoutingNode(p1, d.net)); +"\n";
			});
			
			pos = d.end.pos();
			// connection from port node to port
			pathStr += " L " + [pos[0]+COMPONENT_PADDING +d.target.netChannelPadding.left, pos[1]]+"\n";
			return pathStr;
		}
			
		router.route();	
		//debugRouterDots(svgGroup, grid)
		linkElements.attr("d", drawNet);
	
		links.forEach(function (link){ // rm tmp variables
			delete link.path;
			delete link.end;
			delete link.start;
		});
	}
};

//main function for rendering components layout
function ComponentDiagram(selector, nodes, links){ 
	var wrapper = d3.select(selector);
	wrapper.selectAll("svg").remove(); // delete old on redraw

	var svg = wrapper.append("svg")
		.on("click", onBoardClick)
		.on("mousemove", drawLink);
	
	var svgGroup= svg.append("g"); // because of zooming/moving
	
	addShadows(svg);

    //LINKS
    var linkElements = svgGroup.selectAll(".link")
    	.data(links)
    	.enter()
    	.append("path")
    	.classed({"link": true})
    	.on("click", netOnClick)
    	.on("mouseover", netMouseOver)
    	.on("mouseout", netMouseOut);

   updateNetLayout(svgGroup, linkElements, nodes, links);

    var place = svg.node().getBoundingClientRect();
	// force for self organizing of diagram
	var force = d3.layout.force()
		.gravity(.00)
		.distance(150)
		.charge(-2000)
		.size([place.width, place.height])
		// .nodes(nodes)
		// .links(links)
		// .start();
		
	//EXTERNAL PORTS	
	drawExternalPorts(svgGroup, nodes.filter(function (n){
			return n.isExternalPort;
		}))
		.on("click", exPortOnClick);
		// .on("dblclick", componentDetail);
	
	//COMPONENTS
	drawComponents(svgGroup, nodes.filter(function (n){
			return !n.isExternalPort;
		}))
		.on("click", componentOnClick)
		.call(force.drag); // component dragging
		//.on("dblclick", componentDetail);
	
	function onCompClick(d){
		var scope = angular.element(document.getElementsByTagName('body')[0]).scope();
		scope.compClick(d);	
		d3.event.stopPropagation();
		if (!d3.event.shiftKey) {
			removeSelections();
		}

		d3.select(this).classed({
			"selected-object" : true
		})
	}
	
	function defaultZoom () {
		svgGroup.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");   			
	}
    // define the zoomListener which calls the zoom function on the "zoom" event
	// constrained within the scaleExtents
    var zoomListener = d3.behavior.zoom()
    	.scaleExtent([0.2, 30])
    	.on("zoom", defaultZoom);
    
    //ZOOM
	svgGroup.on("mousedown", function() {
		if (d3.event.shiftKey) {
			zoomListener.on("zoom", null);
		} else {
			zoomListener.on("zoom", defaultZoom);
		}
		})
		.on("mouseup", function() {
			d3.event.translate = [0, 0];
			d3.event.scale = [0, 0];
		});
	
	function fitDiagram2Screen(zoomListener){
        function diagramSize(){
        	var widthMax = 0;
        	var heigthtMax = 0;
        	nodes.forEach(function (n){
        		widthMax = Math.max(n.x + n.width + COMPONENT_PADDING, widthMax);
        		heigthtMax = Math.max(n.y + n.height +COMPONENT_PADDING, heigthtMax);
        	});
        	return [widthMax, heigthtMax];
        }
        var size = diagramSize();
        var scaleX = place.width /size[0] ;
        var scaleY = place.height / size[1];
        var scale = Math.min(scaleX, scaleY); 
        // this is processiong of zoomListener explicit translate and scale on
		// start
        zoomListener.translate([0,0])
        	.scale(scale);
        zoomListener.event(svg.transition()
        					  .duration(100));
    }
	fitDiagram2Screen(zoomListener);
	svg.call(zoomListener);
}
