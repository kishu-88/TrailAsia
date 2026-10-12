'use strict';

/**
 * The reserved `UPLOAD_DIR`/`UPLOAD_MAX_BYTES`/`UPLOAD_ALLOWED_TYPES`
 * settings (`.env.example`, since the scaffold phase) get their first real
 * use: an uploaded file for a `traveller_documents` row.
 *
 * `stored_file_name` is the only one of these that matters for retrieval —
 * a random name under `fileStorage.service.js`'s upload root, never derived
 * from anything a traveller typed. The rest (`original_file_name`,
 * `file_mime_type`, `file_size_bytes`) are display metadata: what to call it
 * and how to render its icon, nothing a path is built from.
 *
 * `file_path` (the existing string column) keeps its original meaning — an
 * external reference or link — for a document with no uploaded file at all.
 * A row can have one, the other, both, or neither; the checklist only cares
 * that the document exists.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('traveller_documents', 'stored_file_name', {
      type: Sequelize.STRING(300),
      allowNull: true,
    });
    await queryInterface.addColumn('traveller_documents', 'original_file_name', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('traveller_documents', 'file_mime_type', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('traveller_documents', 'file_size_bytes', {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('traveller_documents', 'stored_file_name');
    await queryInterface.removeColumn('traveller_documents', 'original_file_name');
    await queryInterface.removeColumn('traveller_documents', 'file_mime_type');
    await queryInterface.removeColumn('traveller_documents', 'file_size_bytes');
  },
};
