module.exports = {
  searchPlaces: async function () {
    return {
      success: true,
      places: [
        {
          name: "Nova Places Test",
          address: "Places module loaded successfully",
          distanceKm: 0
        }
      ]
    };
  }
};
