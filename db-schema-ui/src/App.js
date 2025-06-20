import React, { useEffect, useState, useRef } from "react";
import ReactFlow, { MiniMap, Controls, Background } from "react-flow-renderer";
import axios from "axios";
import dagre from "dagre";
import Modal from "react-modal";
import "./App.css";

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
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [error, setError] = useState("");
  const [modalContent, setModalContent] = useState({
    sql: "SELECT * FROM table_name",
    results: [],
    columns: [],
  });
  const [editableQuery, setEditableQuery] = useState(modalContent.sql);
  const [selectedTable, setSelectedTable] = useState(null); // State for selected table
  const [isModalOpen, setIsModalOpen] = useState(false); // State for modal visibility

  useEffect(() => {
    axios
      .get("https://db-query-gen.onrender.com/schema")
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

    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2 }); // Adjust padding as needed
    }
  }, [reactFlowInstance]);

  useEffect(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2 });
    }
  }, [nodes, edges, reactFlowInstance]);

  const handleNodeClick = async (event, node) => {
    setSelectedTable(node.id); // Set the selected table's label
    setIsModalOpen(true); // Open the modal
    const query = `SELECT * FROM ${node.id}`; // Example query to fetch data from the selected table
    try {
      const response = await axios.post(
        "https://db-query-gen.onrender.com/execute-query",
        {
          query: query,
        }
      );

      const { query_result } = response.data;

      // Update modal content with the fetched data
      setModalContent({
        results: query_result?.results || [],
        columns: query_result?.columns || [],
      });
    } catch (error) {
      console.error("Error executing query:", error);
      alert("Failed to execute query. Please try again.");
    }
  };

  const closePopUpModal = () => {
    setIsModalOpen(false); // Close the modal
    setSelectedTable(null); // Clear the selected table
    setModalContent({ results: [], columns: [] }); // Clear modal content
  };
  const handleQuerySubmit = async () => {
    if (!query.trim()) {
      setError("Query cannot be empty. Please enter a valid query.");
      return;
    }

    try {
      setError(""); // Clear any previous errors
      const response = await axios.post(
        "https://db-query-gen.onrender.com/generate-sql",
        {
          query,
        }
      );

      const { sql, query_result } = response.data;

      if (!sql || !query_result) {
        throw new Error("Could not generate the query");
      }

      // Set modal content and sync editableQuery with the generated SQL
      setModalContent({
        sql: sql || "",
        results: query_result?.results || [],
        columns: query_result?.columns || [],
      });
      setEditableQuery(sql || ""); // Sync editableQuery with the generated SQL
      setModalIsOpen(true);
    } catch (error) {
      console.error("Error generating SQL:", error);
      setError("Failed to generate SQL. Please try again later.");
    }
  };

  const handleExecuteQuery = async () => {
    try {
      // Call your API to execute the query
      const response = await axios.post(
        "https://db-query-gen.onrender.com/execute-query",
        {
          query: editableQuery,
        }
      );

      const { query_result } = response.data;

      // Update modal content with new results
      setModalContent({
        ...modalContent,
        sql: editableQuery,
        results: query_result?.results || [],
        columns: query_result?.columns || [],
      });
    } catch (error) {
      console.error("Error executing query:", error);
      alert("Failed to execute query. Please try again.");
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
    <div
      style={{
        display: "flex",
        height: "100vh",
        flexDirection: "column",
        backgroundColor: "#222",
        color: "#fff",
      }}
    >
      {/* Query Input Section */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center", // for vertical centering
          padding: "24px",
          backgroundColor: "#222",
        }}
      >
        <h2
          style={{
            color: "#61eada",
            fontSize: "1.8rem",
            fontWeight: "bold",
            textShadow: "2px 2px 4px rgba(0, 0, 0, 1)",
            marginTop: "16px",
          }}
        >
          SQL Query Generator
        </h2>
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
            backgroundColor: "#181818",
            color: "#fff",
            border: "1px solid #555", // Subtle border
            borderRadius: "4px", // Rounded corners
          }}
        />

          <div
          style={{
            display: "flex"
          }}
        >
          {/* Message Strip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "#333", // Dark background for the strip
              color: "#fff", // Light text
              padding: "6px 15px",
              borderRadius: "4px", // Rounded corners
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)", 
              marginRight: "16px", // Add spacing between the strip and the button
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                width: "24px",
                height: "24px",
                backgroundColor: "#51daca", // Light blue background for the icon
                color: "#000", // Dark text for the icon
                borderRadius: "50%", // Circular icon
                fontWeight: "bold",
                marginRight: "12px", // Spacing between icon and text
              }}
            >
              i
            </div>
            <p style={{ margin: 0, fontSize: "14px", color: "#bbb" }}>
              Click on a table to see its data.
            </p>
          </div>
        
          {/* Submit Button */}
          <button onClick={handleQuerySubmit} className="submit-button">
            Submit
          </button>
        </div>
      </div>

      {/* React Flow Graph */}
      <div
        style={{
          display: "flex",
          height: "100vh",
          flexDirection: "column",
          backgroundColor: "#222",
          color: "#fff",
        }}
      >
        <div
          style={{ flexGrow: 1, backgroundColor: "#222" }}
          ref={reactFlowWrapper}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            zoomOnScroll={true}
            panOnDrag={true}
            zoomOnDoubleClick={true}
            onNodeClick={handleNodeClick}
            onLoad={setReactFlowInstance} // Set the ReactFlow instance
            snapToGrid={true}
            snapGrid={[15, 15]}
            style={{
              backgroundColor: "#181818", // Dark background for the graph
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
                backgroundColor: "#fff", // Darker controls background
                color: "#fff", // Light text for controls
              }}
            />
            <Background
              color="#000" // Subtle grid lines
              gap={16}
              variant="dots" // Dotted grid
            />
          </ReactFlow>
        </div>
      </div>

      {/* Popup Modal */}
      <Modal
        isOpen={isModalOpen}
        onRequestClose={closePopUpModal}
        contentLabel="Query Results"
        style={{
          overlay: {
            backgroundColor: "rgba(0, 0, 0, 0.85)", // Dark overlay
            zIndex: 1000,
          },
          content: {
            top: "50%",
            left: "50%",
            right: "auto",
            bottom: "auto",
            marginRight: "-50%",
            transform: "translate(-50%, -50%)",
            width: "80%", // Fixed width
            maxHeight: "80%", // Max height to allow scrolling
            backgroundColor: "#333", // Match your theme
            color: "#fff", // Light text
            border: "1px solid #444",
            borderRadius: "8px",
            padding: "20px",
            overflow: "auto", // Add scroll bar if content overflows
          },
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between", // Space between the title and button
            alignItems: "center", // Vertically align items
            marginBottom: "16px", // Add spacing below the row
          }}
        >
          <h3 style={{ color: "#61eada", margin: 0 }}>
            Selected Table: {selectedTable}
          </h3>
          <button onClick={closePopUpModal} className="close-button">
            Close
          </button>
        </div>
        {modalContent.results && modalContent.results.length > 0 ? (
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
                {modalContent.columns.map((columnName, index) => (
                  <th
                    key={index}
                    style={{
                      backgroundColor: "#555",
                      color: "#fff",
                      padding: "8px",
                    }}
                  >
                    {columnName}
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
          <p style={{ color: "#fff" }}>Loading Table Data ...</p>
        )}
      </Modal>

      {/* Modal for displaying results */}
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={closeModal}
        contentLabel="Query Results"
        style={{
          overlay: {
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            zIndex: 1000,
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
            backgroundColor: "#333",
            color: "#fff",
            border: "1px solid #444",
            borderRadius: "8px",
            zIndex: 1001,
          },
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between", // Space between the title and button
            alignItems: "center", // Vertically align items
            marginBottom: "16px", // Add spacing below the row
          }}
        >
          <h2 style={{ color: "#72c8be" }}>Query Results</h2>
          <button onClick={closeModal} className="close-button">
            Close
          </button>
        </div>
        <div>
          <h3 style={{ color: "#bbb" }}>Editable SQL Query:</h3>
          <textarea
            value={editableQuery}
            onChange={(e) => setEditableQuery(e.target.value)}
            rows="6"
            style={{
              width: "100%",
              padding: "10px",
              fontSize: "16px",
              backgroundColor: "#222",
              color: "#0f0",
              border: "1px solid #555",
              borderRadius: "4px",
              marginBottom: "16px",
            }}
          />
          <button onClick={handleExecuteQuery} className="submit-button">
            Execute
          </button>
        </div>
        <div>
          <h3 style={{ color: "#fff" }}>Results:</h3>
          {modalContent.results && modalContent.results.length > 0 ? (
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
                  {modalContent.columns.map((columnName, index) => (
                    <th
                      key={index}
                      style={{
                        backgroundColor: "#555",
                        color: "#fff",
                        padding: "8px",
                      }}
                    >
                      {columnName}
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
