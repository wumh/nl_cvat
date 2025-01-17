/*
 * Copyright (C) 2018 Intel Corporation
 *
 * SPDX-License-Identifier: MIT
 */

/* global
    AREA_TRESHOLD:false
    PolyShapeModel:false
    ShapeCreatorModel:true
    ShapeCreatorView:true
    showMessage:false
*/

/* eslint no-underscore-dangle: 0 */

window.addEventListener('DOMContentLoaded', () => {
    $('<option value="auto_segmentation" class="regular"> 自动分段 </option>').appendTo('#shapeTypeSelector');

    const dextrCancelButtonId = 'dextrCancelButton';
    const dextrOverlay = $(`
        <div class="modal hidden force-modal">
            <div class="modal-content" style="width: 300px; height: 70px;">
                <center> <label class="regular h2"> 正在处理分段请求 </label></center>
                <center style="margin-top: 5px;">
                    <button id="${dextrCancelButtonId}" class="regular h2" style="width: 250px;"> 取消 </button>
                </center>
            </div>
        </div>`).appendTo('body');

    const dextrCancelButton = $(`#${dextrCancelButtonId}`);
    dextrCancelButton.on('click', () => {
        dextrCancelButton.prop('disabled', true);
        $.ajax({
            url: `/dextr/cancel/${window.cvat.job.id}`,
            type: 'GET',
            error: (errorData) => {
                const message = `无法取消细分. 码: ${errorData.status}.
                    信息: ${errorData.responseText || errorData.statusText}`;
                showMessage(message);
            },
            complete: () => {
                dextrCancelButton.prop('disabled', false);
            },
        });
    });

    function ShapeCreatorModelWrapper(OriginalClass) {
        // Constructor will patch some properties for a created instance
        function constructorDecorator(...args) {
            const instance = new OriginalClass(...args);

            // Decorator for the defaultType property
            Object.defineProperty(instance, 'defaultType', {
                get: () => instance._defaultType,
                set: (type) => {
                    if (!['box', 'points', 'polygon', 'polyline', 'auto_segmentation'].includes(type)) {
                        throw Error(`找到未知的形状类型 ${type}`);
                    }
                    instance._defaultType = type;
                },
            });

            // Decorator for finish method.
            const decoratedFinish = instance.finish;
            instance.finish = (result) => {
                if (instance._defaultType === 'auto_segmentation') {
                    try {
                        instance._defaultType = 'polygon';
                        decoratedFinish.call(instance, result);
                    } finally {
                        instance._defaultType = 'auto_segmentation';
                    }
                } else {
                    decoratedFinish.call(instance, result);
                }
            };

            return instance;
        }

        constructorDecorator.prototype = OriginalClass.prototype;
        constructorDecorator.prototype.constructor = constructorDecorator;
        return constructorDecorator;
    }


    function ShapeCreatorViewWrapper(OriginalClass) {
        // Constructor will patch some properties for each instance
        function constructorDecorator(...args) {
            const instance = new OriginalClass(...args);

            // Decorator for the _create() method.
            // We save the decorated _create() and we will use it if type != 'auto_segmentation'
            const decoratedCreate = instance._create;
            instance._create = () => {
                if (instance._type !== 'auto_segmentation') {
                    decoratedCreate.call(instance);
                    return;
                }

                instance._drawInstance = instance._frameContent.polyline().draw({ snapToGrid: 0.1 }).addClass('shapeCreation').attr({
                    'stroke-width': 0,
                    z_order: Number.MAX_SAFE_INTEGER,
                });
                instance._createPolyEvents();

                /* the _createPolyEvents method have added "drawdone"
                * event handler which invalid for this case
                * because of that reason we remove the handler and
                * create the valid handler instead
                */
                instance._drawInstance.off('drawdone').on('drawdone', (e) => {
                    let actualPoints = window.cvat.translate.points.canvasToActual(e.target.getAttribute('points'));
                    actualPoints = PolyShapeModel.convertStringToNumberArray(actualPoints);

                    if (actualPoints.length < 4) {
                        showMessage('需要为对象指定最少四个极值点');
                        instance._controller.switchCreateMode(true);
                        return;
                    }

                    const { frameWidth } = window.cvat.player.geometry;
                    const { frameHeight } = window.cvat.player.geometry;
                    for (let idx = 0; idx < actualPoints.length; idx += 1) {
                        const point = actualPoints[idx];
                        point.x = Math.clamp(point.x, 0, frameWidth);
                        point.y = Math.clamp(point.y, 0, frameHeight);
                    }

                    e.target.setAttribute('points',
                        window.cvat.translate.points.actualToCanvas(
                            PolyShapeModel.convertNumberArrayToString(actualPoints),
                        ));

                    const polybox = e.target.getBBox();
                    const area = polybox.width * polybox.height;

                    if (area > AREA_TRESHOLD) {
                        $.ajax({
                            url: `/dextr/create/${window.cvat.job.id}`,
                            type: 'POST',
                            data: JSON.stringify({
                                frame: window.cvat.player.frames.current,
                                points: actualPoints,
                            }),
                            contentType: 'application/json',
                            success: () => {
                                function intervalCallback() {
                                    $.ajax({
                                        url: `/dextr/check/${window.cvat.job.id}`,
                                        type: 'GET',
                                        success: (jobData) => {
                                            if (['queued', 'started'].includes(jobData.status)) {
                                                if (jobData.status === 'queued') {
                                                    dextrCancelButton.prop('disabled', false);
                                                }
                                                setTimeout(intervalCallback, 1000);
                                            } else {
                                                dextrOverlay.addClass('hidden');
                                                if (jobData.status === 'finished') {
                                                    if (jobData.result) {
                                                        instance._controller.finish({ points: jobData.result }, 'polygon');
                                                    }
                                                } else if (jobData.status === 'failed') {
                                                    const message = `细分已经下降. 错误: '${jobData.stderr}'`;
                                                    showMessage(message);
                                                } else {
                                                    let message = `检查分段请求已返回 "${jobData.status}" 状态.`;
                                                    if (jobData.stderr) {
                                                        message += ` 错误: ${jobData.stderr}`;
                                                    }
                                                    showMessage(message);
                                                }
                                            }
                                        },
                                        error: (errorData) => {
                                            dextrOverlay.addClass('hidden');
                                            const message = `无法检查细分. 码: ${errorData.status}.`
                                                + ` 信息: ${errorData.responseText || errorData.statusText}`;
                                            showMessage(message);
                                        },
                                    });
                                }

                                dextrCancelButton.prop('disabled', true);
                                dextrOverlay.removeClass('hidden');
                                setTimeout(intervalCallback, 1000);
                            },
                            error: (errorData) => {
                                const message = `无法取消ReID进程. 码: ${errorData.status}.`
                                    + ` 信息: ${errorData.responseText || errorData.statusText}`;
                                showMessage(message);
                            },
                        });
                    }

                    instance._controller.switchCreateMode(true);
                }); // end of "drawdone" handler
            }; // end of _create() method

            return instance;
        } // end of constructorDecorator()

        constructorDecorator.prototype = OriginalClass.prototype;
        constructorDecorator.prototype.constructor = constructorDecorator;
        return constructorDecorator;
    } // end of ShapeCreatorViewWrapper

    // Apply patch for classes
    ShapeCreatorModel = ShapeCreatorModelWrapper(ShapeCreatorModel);
    ShapeCreatorView = ShapeCreatorViewWrapper(ShapeCreatorView);
});
