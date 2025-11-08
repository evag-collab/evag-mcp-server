/**
 * Function to fetch country details from the MCP API.
 *
 * @param {Object} args - Arguments for the country details request.
 * @param {string} [args.countryISO3] - The ISO3 Country Name (optional).
 * @returns {Promise<Object>} - The result of the country details fetch.
 */
const executeFunction = async ({ countryISO3 }) => {
  const url = 'https://<your-url>/api/GetCountries'; // replace <your-url> with the actual URL
  const authKey = ''; // will be provided by the user
  try {
    // Set up headers for the request
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'X-Authorization': `Bearer ${authKey}`,
      'Content-Type': 'application/json'
    };

    // Construct the URL with query parameters if needed
    const requestUrl = new URL(url);
    if (countryISO3) {
      requestUrl.searchParams.append('countryISO3', countryISO3);
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
    console.error('Error fetching country details:', error);
    return {
      error: `An error occurred while fetching country details: ${error instanceof Error ? error.message : JSON.stringify(error)}`
    };
  }
};

/**
 * Tool configuration for fetching country details from the MCP API.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'get_countries',
      description: 'Fetch country details from the MCP API.',
      parameters: {
        type: 'object',
        properties: {
          countryISO3: {
            type: 'string',
            description: 'The ISO3 Country Name (optional).'
          }
        }
      }
    }
  }
};

export { apiTool };