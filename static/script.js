resetAll()
const queryInput = document.getElementById('query');
const historyDiv = document.getElementById('history');
const outputDiv = document.getElementById('output');
const diagramContainer = document.getElementById('diagram-container');
const diagramWrapper = document.getElementById('diagram-wrapper');
const centerBtn = document.getElementById('center-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const relationshipTooltip = document.getElementById('relationship-tooltip');

let currentScale = 1;
let tablePositions = [];

// Add event listeners for control buttons
centerBtn.addEventListener('click', centerDiagram);
zoomInBtn.addEventListener('click', () => zoomDiagram(0.1));
zoomOutBtn.addEventListener('click', () => zoomDiagram(-0.1));

// Update ER diagram when page loads
document.addEventListener('DOMContentLoaded', updateERDiagram);

// Handle key presses
queryInput.addEventListener('keydown', function(event) {
  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault();
    runQuery(queryInput.value.trim());
  }
});

function runQuery(sql) {
  if (!sql) return;

  fetch('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: sql })
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error); });
      }
      return response.json();
    })
    .then(data => {
      if ('error' in data) {
        outputDiv.innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
      } else {
        // Only add successful queries to history
        const historyEntry = document.createElement('div');
        historyEntry.textContent = sql;
        historyEntry.style.marginBottom = '10px';
        historyEntry.style.padding = '5px';
        historyEntry.style.borderLeft = '3px solid #4682b4';
        historyDiv.appendChild(historyEntry);
        historyDiv.scrollTop = historyDiv.scrollHeight;

        // Clear the textarea
        queryInput.value = '';

        if ('message' in data) {
          outputDiv.innerHTML = `<p>${data.message} (Rows affected: ${data.rowsAffected})</p>`;
          // Update ER diagram after schema changes
          updateERDiagram();
        } else {
          if (data.length === 0) {
            outputDiv.innerHTML = '<p>No results.</p>';
            return;
          }
          let html = '<table class="results-table"><tr>';
          Object.keys(data[0]).forEach(col => {
            html += `<th>${col}</th>`;
          });
          html += '</tr>';
          data.forEach(row => {
            html += '<tr>';
            Object.values(row).forEach(val => {
              html += `<td>${val === null ? 'NULL' : val}</td>`;
            });
            html += '</tr>';
          });
          html += '</table>';
          outputDiv.innerHTML = html;
        }
      }
    })
    .catch(err => {
      outputDiv.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
      // Don't add failed queries to history
    });
}

function updateERDiagram() {
  // Clear the container first
  diagramContainer.innerHTML = '';

  // Get the schema information from the database
  fetch('/schema', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
    .then(response => response.json())
    .then(data => {
      if (data.tables && data.tables.length > 0) {
        // Create SVG for the connections
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        svg.style.position = "absolute";
        svg.style.top = 0;
        svg.style.left = 0;
        svg.style.zIndex = 5;
        diagramContainer.appendChild(svg);

        // Calculate positions for tables in a grid
        tablePositions = calculateTablePositions(data.tables);

        // Create tables
        data.tables.forEach((table, index) => {
          const tableDiv = document.createElement("div");
          tableDiv.className = "table-container";
          tableDiv.id = `table-${table.name}`;
          tableDiv.style.position = "absolute";
          tableDiv.style.left = `${tablePositions[index].x}px`;
          tableDiv.style.top = `${tablePositions[index].y}px`;

          const titleDiv = document.createElement("div");
          titleDiv.className = "table-title";
          titleDiv.textContent = table.name;
          tableDiv.appendChild(titleDiv);

          table.columns.forEach(column => {
            const fieldDiv = document.createElement("div");
            fieldDiv.className = "table-field";
            if (column.pk) fieldDiv.className += " primary-key";
            if (column.fk) fieldDiv.className += " foreign-key";

            fieldDiv.textContent = `${column.name} (${column.type})`;
            if (column.pk) fieldDiv.textContent += ' PK';
            tableDiv.appendChild(fieldDiv);
          });

          diagramContainer.appendChild(tableDiv);
        });

        // Draw relationship lines after elements are in DOM
        setTimeout(() => {
          drawRelationships(data.tables, svg);
          // Center the diagram after drawing
          centerDiagram();
        }, 100);
      } else {
        diagramContainer.innerHTML = '<p>No tables found in the database.</p>';
      }
    })
    .catch(err => {
      diagramContainer.innerHTML = `<p style="color: red;">Error loading schema: ${err.message}</p>`;
    });
}

function calculateTablePositions(tables) {
  const positions = [];
  const tableCount = tables.length;

  if (tableCount === 1) {
    // Single table centered
    positions.push({ x: 1500 - 75, y: 1000 - 75 });
  } else {
    // Multiple tables in a grid-like arrangement
    const cols = Math.ceil(Math.sqrt(tableCount));
    const rows = Math.ceil(tableCount / cols);

    const colWidth = 400;
    const rowHeight = 300;

    // Calculate starting position to center the grid
    const startX = 1500 - (cols * colWidth) / 2;
    const startY = 1000 - (rows * rowHeight) / 2;

    for (let i = 0; i < tableCount; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;

      positions.push({
        x: startX + col * colWidth,
        y: startY + row * rowHeight
      });
    }
  }

  return positions;
}

function drawRelationships(tables, svg) {
  // First clear any existing relationships
  while (svg.firstChild) {
    svg.removeChild(svg.firstChild);
  }

  tables.forEach(table => {
    table.columns.forEach(column => {
      if (column.fk && column.references) {
        const [targetTableName, targetColumn] = column.references.split('.');

        const sourceTable = document.getElementById(`table-${table.name}`);
        const targetTable = document.getElementById(`table-${targetTableName}`);

        if (sourceTable && targetTable) {
          const sourceRect = sourceTable.getBoundingClientRect();
          const targetRect = targetTable.getBoundingClientRect();

          // Get container offset
          const containerRect = diagramContainer.getBoundingClientRect();
          const wrapperRect = diagramWrapper.getBoundingClientRect();

          // Calculate center points in SVG coordinates
          const sourceOffset = getElementOffset(sourceTable, diagramContainer);
          const targetOffset = getElementOffset(targetTable, diagramContainer);

          const x1 = sourceOffset.left + sourceTable.offsetWidth / 2;
          const y1 = sourceOffset.top + sourceTable.offsetHeight / 2;
          const x2 = targetOffset.left + targetTable.offsetWidth / 2;
          const y2 = targetOffset.top + targetTable.offsetHeight / 2;

          // Create a group for the relationship
          const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
          group.classList.add("relationships-group");

          // Create the line
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("class", "relationship-line");
          line.setAttribute("x1", x1);
          line.setAttribute("y1", y1);
          line.setAttribute("x2", x2);
          line.setAttribute("y2", y2);
          group.appendChild(line);

          // Calculate midpoint
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          // Create a circle at the midpoint
          const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          circle.setAttribute("class", "relationship-node");
          circle.setAttribute("cx", midX);
          circle.setAttribute("cy", midY);
          circle.setAttribute("r", 10);
          group.appendChild(circle);

          // Add a title element for the native tooltip
          const relationshipText = `${table.name}.${column.name} → ${targetTableName}.${targetColumn}`;
          const titleElem = document.createElementNS("http://www.w3.org/2000/svg", "title");
          titleElem.textContent = relationshipText;
          group.appendChild(titleElem);

          svg.appendChild(group);
        }
      }
    });
  });
}


function getElementOffset(element, container) {
  let left = 0;
  let top = 0;
  let current = element;

  while (current && current !== container) {
    left += current.offsetLeft - current.scrollLeft;
    top += current.offsetTop - current.scrollTop;
    current = current.offsetParent;
  }

  return { left, top };
}

function centerDiagram() {
  if (tablePositions.length === 0) return;

  // Calculate the center of all tables
  let sumX = 0, sumY = 0;
  tablePositions.forEach(pos => {
    sumX += pos.x;
    sumY += pos.y;
  });

  const centerX = sumX / tablePositions.length;
  const centerY = sumY / tablePositions.length;

  // Scroll to center
  diagramWrapper.scrollLeft = centerX - diagramWrapper.clientWidth / 2.75;
  diagramWrapper.scrollTop = centerY - diagramWrapper.clientHeight / 2.75;
}

function zoomDiagram(delta) {
  const newScale = Math.max(0.5, Math.min(2, currentScale + delta));
  if (newScale === currentScale) return;

  currentScale = newScale;
  diagramContainer.style.transform = `scale(${currentScale})`;
  diagramContainer.style.transformOrigin = 'top left';

  // Adjust container size to account for scaling
  diagramContainer.style.width = `${3000 / currentScale}px`;
  diagramContainer.style.height = `${2000 / currentScale}px`;
}

function resetAll() {
  fetch('/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error); });
      }
      return response.json();
    })
    .then(data => {
      queryInput.value = '';
      historyDiv.innerHTML = '';
      outputDiv.innerHTML = `<p>${data.message}</p>`;
      // Also update ER diagram after reset
      updateERDiagram();
    })
    .catch(err => {
      outputDiv.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
    });
}
