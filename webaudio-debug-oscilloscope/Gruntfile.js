module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		watch: {
			scripts: {
				files: ['**/*.js'],
				tasks: ['browserify'],
				options: {
					spawn: false
				}
			}
		},
		browserify: {
			dist: {
				files: {
					'build/<%= pkg.name%>.js': ['./webaudio-debug-oscilloscope.js']
				}
			},
			options : {
				bundleOptions : {
					debug : true
				},
				watch : true,
				keepAlive : true
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-watch');

	grunt.registerTask('default', ['watch']);

};
