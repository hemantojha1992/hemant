let dbPool = require('../database/db');


class Item {
  static async getAllItems() {
    // Add code to retrieve all items from the database
  }

  static async createItem(name, description, price) {
    // Add code to insert a new item into the database
  }

  static async updateItem(id, name, description, price) {
    // Add code to update an item in the database
  }

  static async deleteItem(id) {
    // Add code to delete an item from the database
  }
}

module.exports = Item;
