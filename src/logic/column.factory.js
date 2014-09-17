gantt.factory('Column', [ 'dateFunctions', function (df) {
    // Used to display the Gantt grid and header.
    // The columns are generated by the column generator.

    var calcDbyP = function(column, maxDateValue, currentPosition) {
        return Math.round(maxDateValue/column.width * currentPosition / (maxDateValue / column.subScale)) * (maxDateValue / column.subScale);
    };

    var calcPbyD = function(column, date, maxDateValue, currentDateValue, a, b) {
        var factor;

        if (date - column.date > 0 && a !== b) {
            factor = 1;
        } else {
            factor = Math.round(currentDateValue/maxDateValue * column.subScale) / column.subScale;
        }

        return Math.round( (column.left + column.width * factor) * 10) / 10;
    };

    var Column = function(date, left, width, subScale) {
        var self = this;
        self.date = date;
        self.left = left;
        self.width = width;
        self.subScale = subScale;

        self.getEndDate = function() {
            return self.getDateByPosition(self.width);
        };

        self.clone = function() {
            return new Column(self.date, self.left, self.width, self.subScale);
        };

        self.equals = function(other) {
            return self.date === other.date;
        };

    };

    var MonthColumn = function(date, left, width, subScale) {
        var column = new Column(date, left, width, subScale);
        column.daysInMonth = df.getDaysInMonth(column.date);

        column.clone = function() {
            return new Column(column.date, column.left, column.width, column.subScale);
        };

        column.getDateByPosition = function(position) {
            if (position < 0) position = 0;
            if (position > column.width) position = column.width;

            var res = df.clone(column.date);
            res.setDate(1 + calcDbyP(column, column.daysInMonth, position));
            return res;
        };

        column.getPositionByDate = function(date) {
            return calcPbyD(column, date, column.daysInMonth, date.getDate(), date.getMonth(), column.date.getMonth());
        };

        return column;
    };

    var WeekColumn = function(date, left, width, subScale, firstDayOfWeek) {
        var column = new Column(date, left, width, subScale);
        column.week = df.getWeek(date);
        column.firstDayOfWeek = firstDayOfWeek;
        column.daysInWeek = 7;

        column.clone = function() {
            var copy = new Column(column.date, column.left, column.width, column.subScale);
            copy.week = column.week;
            return copy;
        };

        // Adjusts the day so that the specified first day of week is index = 0
        var firstDayIs0 = function(day) {
            return ((column.daysInWeek - column.firstDayOfWeek) + day) % column.daysInWeek;
        };

        // Adjusts the day so that Sunday= 0, Monday = 1, ...
        var firstDayIsSunday = function(day) {
            return (column.firstDayOfWeek + day) % column.daysInWeek;
        };

        var getWeek = function(date) {
            if (column.firstDayOfWeek !== 1) {
                // Adjust date so that firstDayOfWeek is always Monday because df.getWeek returns a ISO week number which starts on Monday.
                // Otherwise if for e.g. firstDayOfWeek is 0 the Sunday would be in week number X while Monday would be in week number Y.
                df.getWeek(df.addDays(date, 1 - column.firstDayOfWeek, true));
            } else {
                return df.getWeek(date);
            }
        };

        column.getDateByPosition = function(position) {
            if (position < 0) position = 0;
            if (position > column.width) position = column.width;

            var res = df.clone(column.date);
            var day = Math.round(calcDbyP(column, column.daysInWeek, position));

            // If day === 7, then jump forward to next week
            var direction = day !== 7 && day < 0 ? -1: 1; // -1: <<<<< | 1: >>>>>

            df.setToDayOfWeek(res, day !== 7 ? firstDayIsSunday(day): firstDayIsSunday(day) + 7, false, direction);
            return res;
        };

        column.getPositionByDate = function(date) {
            return calcPbyD(column, date, column.daysInWeek, firstDayIs0(date.getDay()), getWeek(date), getWeek(column.date));
        };

        return column;
    };

    var DayColumn = function(date, left, width, subScale, isWeekend, daysToNextWorkingDay, daysToPrevWorkingDay, workHours, showNonWorkHours) {
        var column = new Column(date, left, width, subScale);
        column.isWeekend = isWeekend;
        column.showNonWorkHours = showNonWorkHours;
        
        var startHour = 0;
        var endHour = 24;

        if(arguments.length == 9 && !showNonWorkHours && workHours.length > 1){
            startHour = workHours[0];
            endHour = workHours[workHours.length-1] + 1;
        }

        column.clone = function() {
            var copy = new Column(column.date, column.left, column.width, column.subScale);
            copy.isWeekend = column.isWeekend;
            return copy;
        };

        column.getDateByPosition = function(position, snapForward) {
            if (position < 0) position = 0;
            if (position > column.width) position = column.width;

            var res = df.clone(column.date);
            var hours = startHour + calcDbyP(column, (endHour-startHour), position);

            // Snap is done because a DAY can hide the non-work hours. If this is the case the start or end date of a task shall be the last work hour of the current day and not the next day.
            if(arguments.length == 2){
                if (hours === endHour && snapForward){
                    //We have snapped to the end of one day but this is a start of a task so it should snap to the start of the next displayed day
                    res = df.addDays(res, daysToNextWorkingDay);
                    hours = startHour;
                }
                else if (hours === startHour && !snapForward){
                    //We have snapped to the start of one day but this is the end of a task so it should snap to the end of the previous displayed day
                    res = df.addDays(res, -daysToPrevWorkingDay);
                    hours = endHour;
                }
            }

            res.setHours(hours);
            return res;
        };

        column.getPositionByDate = function(date) {
            //first check that the date actually corresponds to this column
            //(it is possible that it might not if weekends are hidden, in which case this will be the nearest previous column)
            if (df.setTimeZero(date,true) > df.setTimeZero(column.date, true)) return column.left + column.width;
            if (df.setTimeZero(date,true) < df.setTimeZero(column.date, true)) return column.left;

            var maxDateValue = endHour-startHour;
            var currentDateValue = date.getHours()-startHour;
            if (currentDateValue < 0) return column.left;
            else if (currentDateValue > maxDateValue) return column.left + column.width;
            else return calcPbyD(column, date, maxDateValue, currentDateValue, date.getDate(), column.date.getDate());
        };

        return column;
    };

    var HourColumn = function(date, left, width, subScale, isWeekend, isWorkHour, hoursToNextWorkingDay, hoursToPrevWorkingDay) {
        var column = new Column(date, left, width, subScale);
        column.isWeekend = isWeekend;
        column.isWorkHour = isWorkHour;

        column.clone = function() {
            var copy = new Column(column.date, column.left, column.width, column.subScale);
            copy.isWeekend = column.isWeekend;
            copy.isWorkHour = column.isWorkHour;
            return copy;
        };

        column.getDateByPosition = function(position, snapForward) {
            if (position < 0) position = 0;
            if (position > column.width) position = column.width;

            var res = df.clone(column.date);
            var minutes = calcDbyP(column, 60, position);

            // Snap is done because a HOUR can hide the non-work hours. If this is the case the start or end date of a task shall be the last work hour of the current day and not the next day.
            if(arguments.length == 2){
                if (minutes === 60 && snapForward){
                    //We have snapped to the end of one day but this is a start of a task so it should snap to the start of the next displayed day
                    res = df.addHours(res, hoursToNextWorkingDay);
                    minutes = 0;
                }
                else if (minutes === 0 && !snapForward){
                    //We have snapped to the start of one day but this is the end of a task so it should snap to the end of the previous displayed day
                    res = df.addHours(res, -hoursToPrevWorkingDay);
                    minutes = 60;
                }
            }

            res.setMinutes(minutes);
            return res;
        };

        column.getPositionByDate = function(date) {
            if (df.setTimeZero(date,true) > df.setTimeZero(column.date, true)) return column.left + column.width;

            return calcPbyD(column, date, 60, date.getMinutes(), date.getHours(), column.date.getHours());
        };

        return column;
    };

    return {
        Hour: HourColumn,
        Day: DayColumn,
        Week: WeekColumn,
        Month: MonthColumn
    };
}]);