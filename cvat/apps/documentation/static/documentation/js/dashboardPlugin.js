/*
 * Copyright (C) 2018 Intel Corporation
 *
 * SPDX-License-Identifier: MIT
 */

window.addEventListener('DOMContentLoaded', () => {
    $('<button id="userGuide" class="regular h1" style="margin-left: 5px;"> 用户指南 </button>').on('click', () => {
        window.open('/documentation/user_guide.html');
    }).appendTo('#dashboardManageButtons');
});
