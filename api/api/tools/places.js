module.exports = {
  searchPlaces: async function ({
    query = "places",
    latitude = null,
    longitude = null,
    location = null
  } = {}) {
    console.log("NOVA PLACES TEST MODULE LOADED");

    return {
      success: true,
      places: [
        {
          name: "Nova Places Test",
          address: "Places module loaded successfully",
          distanceKm: 0
        }
      ],
      location: {
        latitude,
        longitude,
        name: location || "your current location"
      },
      query
    };
  }
};
