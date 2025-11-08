/**
 * Function to fetch time zone details from the MCP server.
 *
 * @returns {Promise<Object>} - The response containing time zone details.
 */


const executeFunction = async () => {
  const url = 'https://simforthings-dev.bics.com/api/GetTimeZone';
  const authKey = ''; // will be provided by the user

console.log('Auth header:', `Bearer ${authKey}`);
  try {
    // Set up headers for the request
    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Authorization': `Bearer ${authKey}`
    };

    // Perform the fetch request
    const response = await fetch(url, {
      method: 'GET',
      headers
    });

    // Check if the response was successful
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(JSON.stringify(errorData));
    }

    // Parse and return the response data
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching time zone details:', error);
    return {
      error: `An error occurred while fetching time zone details: ${error instanceof Error ? error.message : JSON.stringify(error)}`
    };
  }
};

/**
 * Tool configuration for fetching time zone details from the MCP server.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'get_timezones',
      description: 'Fetch time zone details from the MCP server.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
};

export { apiTool };
