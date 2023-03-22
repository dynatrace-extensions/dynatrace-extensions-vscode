import * as assert from "assert";

import {createValidFileName} from "../../commandPalette/createAlert";


suite("Create Alert Test Suite", () => {

    /**
     * Check that it generates valid file names
     */
    test("Test createUniqueAlertFileName", () => {

        const expectedRegex = "[a-zA-Z0-9]+([-_./][a-zA-Z0-9]+)*";
        assert.ok(createValidFileName("! This is a very !!!important!!! alert !").match(expectedRegex));
        assert.ok(createValidFileName("This is a very important alert").match(expectedRegex));
        assert.ok(createValidFileName("This 😀 is a very important alert 😀").match(expectedRegex));

    });
});