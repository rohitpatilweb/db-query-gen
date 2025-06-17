import React, { useEffect, useState, useRef } from "react";
import ReactFlow, { MiniMap, Controls, Background } from "react-flow-renderer";
import axios from "axios";
import dagre from "dagre";
import Modal from "react-modal";

// Set the app element for accessibility (required for React Modal)
Modal.setAppElement("#root");

const nodeWidth = 220;

function getNodeHeight(cols) {
  return 40 + cols.length * 20;
}

const getLayoutedElements = (nodes, edges, direction = "LR") => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({
    rankdir: direction, // Set direction to "LR" for horizontal layout
    nodesep: 150, // Horizontal spacing between nodes
    ranksep: 150, // Vertical spacing between nodes
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: nodeWidth,
      height: node.style?.height || 50,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return {
    nodes: nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      node.position = {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - (node.style?.height || 50) / 2,
      };
      node.draggable = true; 
      return node;
    }),
    edges,
  };
};

function App() {
  const [query, setQuery] = useState("");
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalContent, setModalContent] = useState({ sql: "", results: [] });
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  useEffect(() => {
    axios
      .get("http://localhost:5001/schema")
      .then(({ data }) => {
        const { tables, foreign_keys } = data;

        const newNodes = Object.entries(tables).map(([tableName, cols]) => {
          const height = getNodeHeight(cols);
          return {
            id: tableName,
            type: "default",
            data: {
              label: (
                <>
                  <strong>{tableName}</strong>
                  <ul style={{ margin: 0, paddingLeft: 10, listStyle: "none" }}>
                    {cols.map((col) => (
                      <li key={col.name}>
                        {col.name} : {col.type}
                      </li>
                    ))}
                  </ul>
                </>
              ),
            },
            position: { x: 0, y: 0 },
            style: {
              width: nodeWidth,
              height,
              padding: 5,
              border: "1px solid #222",
              borderRadius: 5,
               backgroundColor: "#282c34",
              color: "#69fadb",
            },
          };
        });

        const newEdges = foreign_keys.map(
          ({ source_table, target_table }, i) => ({
            id: `e${source_table}-${target_table}`,
            source: source_table,
            target: target_table,
            animated: true,
            style: { stroke: "#f6ab6c" },
            arrowHeadType: "arrowclosed",
          })
        );

        const { nodes: layoutedNodes, edges: layoutedEdges } =
          getLayoutedElements(newNodes, newEdges, "LR");

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2 });
    }
  }, [nodes, edges, reactFlowInstance]);

  const handleQuerySubmit = async () => {
    try {
      const response = await axios.post("http://localhost:5001/generate-sql", {
        query,
      });

      const { sql, query_result } = response.data;

      // Open the modal and set the content
      setModalContent({
        sql,
        results: query_result.results,
      });
      setModalIsOpen(true);
    } catch (error) {
      console.error(error);
      alert("Failed to generate SQL");
    }
  };

  const closeModal = () => {
    setModalIsOpen(false);
  };

  useEffect(() => {
    // Example: Initialize nodes and edges for React Flow
    const initialNodes = [
      {
        id: "1",
        data: { label: "Node 1" },
        position: { x: 0, y: 0 },
        style: { height: 50 },
      },
      {
        id: "2",
        data: { label: "Node 2" },
        position: { x: 0, y: 0 },
        style: { height: 50 },
      },
    ];

    const initialEdges = [
      { id: "e1-2", source: "1", target: "2", animated: true },
    ];

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      initialNodes,
      initialEdges 
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, []);

  return (
       <div style={{ display: "flex", height: "100vh", flexDirection: "column", backgroundColor: "#222", color: "#fff" }}>
      {/* Query Input Section */}
      <div style={{ padding: "16px", backgroundColor: "#333", borderBottom: "1px solid #444" }}>
        <h2 style={{ color: "#61eada" }}>SQL Query Generator</h2>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your query here... (e.g., 'What is the average salary for each job title?')"
          rows="4"
          cols="50"
          style={{
            width: "100%",
            padding: "8px",
            fontSize: "16px",
            marginBottom: "16px",
            backgroundColor: "#444", // Dark background for the textarea
            color: "#fff", // Light text color
            border: "1px solid #555", // Subtle border
            borderRadius: "4px", // Rounded corners
          }}
        />
        <button
          onClick={handleQuerySubmit}
          style={{
            backgroundColor: "#555", // Dark button background
            color: "#fff", // Light text color
            border: "none",
            padding: "8px 16px",
            fontSize: 16,
            cursor: "pointer",
            borderRadius: "4px", // Rounded corners
          }}
        >
          Submit
        </button>
      </div>
    
      {/* React Flow Graph */}
      <div style={{ flexGrow: 1, backgroundColor: "#222" }} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          zoomOnScroll={true}
          panOnDrag={true}
          zoomOnDoubleClick={true}
          onLoad={setReactFlowInstance}
          snapToGrid={true}
          snapGrid={[15, 15]}
          style={{
            backgroundColor: "#222", // Dark background for the graph
            color: "#fff", // Light text for nodes
          }}
        >
          <MiniMap
            nodeColor={() => "#555"} // Darker nodes in the minimap
            nodeStrokeWidth={3}
            style={{
              backgroundColor: "#333", // Dark background for the minimap
            }}
          />
          <Controls
            style={{
              backgroundColor: "#444", // Darker controls background
              color: "#fff", // Light text for controls
            }}
          />
          <Background
            color="#555" // Subtle grid lines
            gap={16}
            variant="dots" // Dotted grid
          />
        </ReactFlow>
      </div>
    
      {/* Modal for displaying results */}
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        contentLabel="Query Results"
        style={{
          overlay: {
            backgroundColor: "rgba(0, 0, 0, 0.85)", // Darker opaque background
            zIndex: 1000, // Ensure the modal is above other elements
          },
          content: {
            top: "50%",
            left: "50%",
            right: "auto",
            bottom: "auto",
            marginRight: "-50%",
            transform: "translate(-50%, -50%)",
            width: "80%",
            maxHeight: "80%",
            overflow: "auto",
            backgroundColor: "#333", // Dark background for the modal
            color: "#fff", // Light text color
            border: "1px solid #444", // Subtle border for the modal
            borderRadius: "8px", // Rounded corners
            zIndex: 1001, // Ensure content is above the overlay
          },
        }}
      >
        <h2 style={{ color: "#fff" }}>Query Results</h2>
        <button
          onClick={closeModal}
          style={{
            float: "right",
            backgroundColor: "#555",
            color: "#fff",
            border: "none",
            padding: "8px 16px",
            cursor: "pointer",
            borderRadius: "4px",
          }}
        >
          Close
        </button>
        <div>
          <h3 style={{ color: "#fff" }}>Generated SQL:</h3>
          <pre
            style={{
              backgroundColor: "#222",
              color: "#0f0",
              padding: "10px",
              borderRadius: "4px",
            }}
          >
            {modalContent.sql}
          </pre>
        </div>
        <div>
          <h3 style={{ color: "#fff" }}>Results:</h3>
          {modalContent.results.length > 0 ? (
            <table
              border="1"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                backgroundColor: "#444",
                color: "#fff",
              }}
            >
              <thead>
                <tr>
                  {modalContent.results[0].map((_, index) => (
                    <th
                      key={index}
                      style={{
                        backgroundColor: "#555",
                        color: "#fff",
                        padding: "8px",
                      }}
                    >
                      Column {index + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modalContent.results.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        style={{
                          padding: "8px",
                          border: "1px solid #666",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "#fff" }}>No results found.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

export default App;
