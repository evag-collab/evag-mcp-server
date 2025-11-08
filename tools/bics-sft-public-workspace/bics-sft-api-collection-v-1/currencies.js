/**
 * Function to fetch currency details from the MCP API.
 *
 * @param {Object} args - Arguments for the currency fetch.
 * @param {string} [args.currencyType] - Optional currency type to filter the results.
 * @returns {Promise<Object>} - The result of the currency fetch.
 */
const executeFunction = async ({ currencyType } = {}) => {
  const url = 'https://<your-url>/api/GetCurrency'; // Replace <your-url> with the actual URL
  const authKey = ''; // will be provided by the user
  try {
    // Set up headers for the request
    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };

    // If an auth key is provided, add it to the Authorization header
    if (authKey) {
      headers['X-Authorization'] = `Bearer ${authKey}`;
    }

    // Construct the URL with query parameters if currencyType is provided
    const requestUrl = new URL(url);
    if (currencyType) {
      requestUrl.searchParams.append('currencyType', currencyType);
    }

    // Perform the fetch request
    const response = await fetch(requestUrl.toString(), {
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
    console.error('Error fetching currency details:', error);
    return {
      error: `An error occurred while fetching currency details: ${error instanceof Error ? error.message : JSON.stringify(error)}`
    };
  }
};

/**
 * Tool configuration for fetching currency details from the MCP API.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'fetch_currency_details',
      description: 'Fetch currency details from the MCP API.',
      parameters: {
        type: 'object',
        properties: {
          currencyType: {
            type: 'string',
            description: 'Optional currency type to filter the results.'
          }
        }
      }
    }
  }
};

export { apiTool };